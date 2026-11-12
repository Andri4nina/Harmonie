# Worker d'analyse audio (Python). Contexte de build : la racine du dépôt.
#   docker build -f deploy/worker.Dockerfile -t harmonie-worker .

FROM python:3.12-slim-trixie
# ffmpeg décode les formats que libsndfile ne lit pas (m4a, aac, webm).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home harmonie
WORKDIR /app
COPY workers/audio-analyzer/pyproject.toml ./
COPY workers/audio-analyzer/harmonia_worker ./harmonia_worker
RUN pip install --no-cache-dir .
USER harmonie
# Cache des fonctions compilées par numba (premier lancement plus rapide ensuite).
ENV NUMBA_CACHE_DIR=/tmp/numba PYTHONUNBUFFERED=1
CMD ["python", "-m", "harmonia_worker", "serve"]
