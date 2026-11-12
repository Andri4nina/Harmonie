"""Mode service : le worker interroge l'API, analyse, rend les descripteurs.

Le worker n'a accès ni à la base ni au stockage : il ne parle qu'aux routes
`/internal` de l'API, avec le secret partagé `WORKER_TOKEN`.

    HARMONIE_API_URL=https://api.example.org WORKER_TOKEN=… python -m harmonia_worker serve
"""

from __future__ import annotations

import json
import logging
import os
import socket
import tempfile
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from .features import extract

VERSION = "1.3.0"
HEARTBEAT_S = 20.0
log = logging.getLogger("harmonia_worker")

EXTENSIONS = {
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/webm": ".webm",
}


class Conflict(Exception):
    """Le job n'est plus attribué à ce worker (repris après un silence)."""


@dataclass
class Api:
    base_url: str
    token: str
    timeout: float = 60.0

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, bytes, str]:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base_url.rstrip("/") + path, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read(), response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as error:
            if error.code == 409:
                raise Conflict(error.read().decode(errors="replace")) from error
            raise RuntimeError(f"{method} {path} : HTTP {error.code} {error.read().decode(errors='replace')}") from error


def process(api: Api, worker_id: str, job: dict) -> None:
    job_id = job["job_id"]
    stop = threading.Event()

    def beat(progress: float, stage: str) -> None:
        api.request("POST", f"/internal/jobs/{job_id}/heartbeat", {"worker_id": worker_id, "progress": progress, "stage": stage})

    state = {"progress": 0.05, "stage": "decode"}

    def keep_alive() -> None:
        while not stop.wait(HEARTBEAT_S):
            try:
                beat(state["progress"], state["stage"])
            except Exception as error:  # le job sera repris par un autre worker
                log.warning("signe de vie refusé pour %s : %s", job_id, error)
                return

    thread = threading.Thread(target=keep_alive, daemon=True)
    thread.start()
    path = None
    try:
        _status, audio, content_type = api.request("GET", job["audio_path"])
        suffix = EXTENSIONS.get(content_type.split(";")[0].strip(), ".audio")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(audio)
            path = handle.name
        state.update(progress=0.2, stage="features")
        beat(state["progress"], state["stage"])
        start = (job.get("range_start_ms") or 0) / 1000
        end = job.get("range_end_ms")
        duration = None if end is None else end / 1000 - start
        features = extract(path, offset_s=start, duration_s=duration)
        state.update(progress=0.9, stage="interpret")
        api.request("POST", f"/internal/jobs/{job_id}/complete", {"worker_id": worker_id, "worker_version": VERSION, "features": features})
        log.info("job %s terminé", job_id)
    except Conflict:
        log.warning("job %s repris par un autre worker : abandon", job_id)
    except Exception as error:
        log.exception("job %s en échec", job_id)
        try:
            api.request("POST", f"/internal/jobs/{job_id}/fail", {"worker_id": worker_id, "error": str(error)[:2000]})
        except Exception:
            log.exception("impossible de signaler l'échec de %s", job_id)
    finally:
        stop.set()
        if path:
            os.unlink(path)


def serve(base_url: str, token: str, poll_s: float = 5.0, once: bool = False) -> None:
    api = Api(base_url, token)
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    log.info("worker %s à l'écoute de %s", worker_id, base_url)
    while True:
        try:
            status, body, _ = api.request("POST", "/internal/jobs/claim", {"worker_id": worker_id})
        except Exception as error:
            log.warning("API injoignable : %s", error)
            status, body = 0, b""
        if status == 200:
            process(api, worker_id, json.loads(body))
            continue  # un autre job attend peut-être
        if once:
            return
        time.sleep(poll_s)
