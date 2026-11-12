import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ACCEPTED, MAX_UPLOAD_MB, type Track, formatDuration, listTracks, uploadTrack } from "../app/api";
import { missingConfiguration, signIn, signOut, signUp, startSession, useSession } from "../app/session";
import { Loader } from "../components/Loader";
import { Icon, Panel } from "../components/ui";

const STATUS: Record<string, string> = {
  queued: "en attente d'analyse",
  running: "analyse en cours",
  succeeded: "analysé",
  failed: "analyse impossible",
  cancelled: "analyse annulée",
};

function Title({ children }: { children: string }) {
  return (
    <h1 className="font-display engrave text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em] text-balance">
      {children}
    </h1>
  );
}

/** Ce qui manque pour brancher l'analyse sur ce site. */
function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <Panel framed={false}>
      <p className="max-w-[62ch] text-ivory-2">
        L'analyse demande un compte et le serveur d'analyse, qui ne sont pas encore reliés à cette version du site.
        Variables à définir à la construction : {missing.join(", ")}. La marche à suivre est dans{" "}
        <span className="text-ivory">docs/DEPLOYMENT.md</span>.
      </p>
    </Panel>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = (action: "in" | "up") => async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (action === "in") await signIn(email, password);
      else if (await signUp(email, password)) {
        setMessage({ text: "Compte créé. Ouvrez le lien reçu par courriel pour le confirmer, puis connectez-vous.", error: false });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Connexion" className="max-w-md">
      <p className="mb-4 text-ivory-2">Vos morceaux et leurs analyses sont rangés dans votre compte.</p>
      <form onSubmit={run("in")} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="caption">Adresse électronique</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-white/[0.03] px-3 outline-none focus:border-[var(--accent-line)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="caption">Mot de passe</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-white/[0.03] px-3 outline-none focus:border-[var(--accent-line)]"
          />
        </label>
        {message && (
          <p role={message.error ? "alert" : "status"} className={message.error ? "text-[#f0a48c]" : "text-ivory-2"}>
            {message.text}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn btn-primary">
            Se connecter
          </button>
          <button type="button" disabled={busy || !email || password.length < 6} onClick={() => void run("up")()} className="btn btn-ghost">
            Créer un compte
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Upload({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (chosen: File | undefined) => {
    setError(null);
    if (!chosen) return;
    if (chosen.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Ce fichier dépasse ${MAX_UPLOAD_MB} Mo. Exportez une version plus courte ou plus compressée.`);
      return;
    }
    setFile(chosen);
    setTitle(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadTrack(file, title);
      setFile(null);
      setTitle("");
      onUploaded();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
        className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          dragging ? "border-brass bg-[var(--accent-soft)]" : "border-[rgb(236_230_216/0.18)] hover:border-[var(--accent-line)]"
        }`}
      >
        <Icon name="analyzer" className="size-7 text-brass" />
        <span className="font-medium">{file ? file.name : "Déposez un fichier audio ou choisissez-le"}</span>
        <span className="caption">WAV, MP3, FLAC, OGG, M4A, jusqu'à {MAX_UPLOAD_MB} Mo</span>
      </button>
      <input ref={input} type="file" accept={ACCEPTED} hidden onChange={(event) => choose(event.target.files?.[0])} />
      {file && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <span className="caption">Titre</span>
            <input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11 rounded-xl border border-line bg-white/[0.03] px-3 outline-none focus:border-[var(--accent-line)]"
            />
          </label>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "Envoi en cours" : "Analyser ce morceau"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[#f0a48c]">
          {error}
        </p>
      )}
    </form>
  );
}

/** Liste des morceaux, rafraîchie tant qu'une analyse est en cours. */
export function TrackList({ version = 0 }: { version?: number }) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTracks(await listTracks());
      setError(null);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const pending = tracks?.some((track) => track.status === "queued" || track.status === "running") ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [pending, load]);

  if (error) return <p className="text-[#f0a48c]">{error}</p>;
  if (!tracks) return <Loader label="Chargement de la bibliothèque" />;
  if (tracks.length === 0) return <p className="text-ivory-2">Aucun morceau pour l'instant. Déposez-en un pour lancer sa première analyse.</p>;
  return (
    <ul className="flex flex-col">
      {tracks.map((track) => (
        <li key={track.id} className="border-t border-line">
          <Link to={`/analyser/${track.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:text-brass">
            <span className="min-w-0 flex-1 basis-48 truncate font-medium">{track.title}</span>
            <span className="caption">{formatDuration(track.duration_ms)}</span>
            <span className={`caption ${track.status === "failed" ? "!text-[#f0a48c]" : ""}`}>
              {STATUS[track.status ?? ""] ?? "sans analyse"}
              {track.status === "running" && track.progress !== null ? `, ${Math.round(track.progress * 100)} %` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Garde commune : configuration, session, puis le contenu réservé aux connectés. */
export function SignedIn({ children }: { children: React.ReactNode }) {
  useEffect(startSession, []);
  const { ready, token, email } = useSession();
  const missing = missingConfiguration();
  if (missing.length > 0) return <NotConfigured missing={missing} />;
  if (!ready) return <Loader label="Lecture de la session" />;
  if (!token) return <SignIn />;
  return (
    <>
      {children}
      <p className="caption mt-8">
        Connecté : {email}.{" "}
        <button type="button" onClick={() => void signOut()} className="underline underline-offset-4 hover:text-ivory">
          Se déconnecter
        </button>
      </p>
    </>
  );
}

export function Analyzer() {
  const [version, setVersion] = useState(0);
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <Title>Analyser un morceau</Title>
        <p className="mt-4 max-w-[62ch] text-ivory-2">
          Harmonie repère la tonalité, les accords, le tempo et la mesure, avec pour chacun son degré de certitude. Vous
          pouvez ensuite écouter le morceau en suivant ses accords, et corriger ce qui est faux.
        </p>
      </section>
      <SignedIn>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <Panel title="Nouveau morceau">
            <Upload onUploaded={() => setVersion((v) => v + 1)} />
          </Panel>
          <Panel title="Vos morceaux" framed={false}>
            <TrackList version={version} />
          </Panel>
        </div>
      </SignedIn>
    </div>
  );
}

export function Library() {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <Title>Ma bibliothèque</Title>
        <p className="mt-4 max-w-[62ch] text-ivory-2">
          Les morceaux que vous avez déposés.{" "}
          <Link to="/analyser" className="text-brass underline underline-offset-4">
            Ajouter un morceau
          </Link>
        </p>
      </section>
      <SignedIn>
        <TrackList />
      </SignedIn>
    </div>
  );
}
