import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { useIsApp } from "../app/platform";
import { enabledProviders, signIn, signInWithGoogle, signUp } from "../app/session";
import { CAPTCHA_SITE_KEY, Captcha } from "./Captcha";
import { Logo } from "./Logo";
import { Panel } from "./ui";

/** Le « G » de Google, dans ses couleurs (charte de connexion Google). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px] shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SignIn({ next, intro = "Vos morceaux et leurs analyses sont rangés dans votre compte." }: { /** Page où revenir après Google ; par défaut, la page courante. */ next?: string; intro?: string }) {
  // Google refuse les connexions depuis une vue web intégrée (applications) :
  // le bouton n'y est pas proposé.
  const inApp = useIsApp();
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let live = true;
    void enabledProviders().then((providers) => live && setGoogle(Boolean(providers.google)));
    return () => {
      live = false;
    };
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Vérification anti-robots (si activée) : un jeton par essai.
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsCaptcha = Boolean(CAPTCHA_SITE_KEY) && !captcha;
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = (action: "in" | "up") => async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (action === "in") await signIn(email, password, captcha ?? undefined);
      else if (await signUp(email, password, captcha ?? undefined)) {
        setMessage({ text: "Compte créé. Ouvrez le lien reçu par courriel pour le confirmer, puis connectez-vous.", error: false });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
      // Le jeton ne sert qu'une fois : on en redemande un.
      setAttempt((count) => count + 1);
    }
  };

  return (
    <Panel className="rise-in w-full max-w-md">
      <div className="mb-4 flex items-center gap-3">
        <Logo className="size-11 shrink-0" moving />
        <h2 className="font-display text-xl font-semibold">Connexion</h2>
      </div>
      <p className="mb-4 text-ivory-2">{intro}</p>
      {!inApp && google && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signInWithGoogle(next ?? window.location.pathname).catch((error: unknown) => {
                setMessage({ text: (error as Error).message, error: true });
                setBusy(false);
              });
            }}
            className="btn btn-ghost w-full"
          >
            <GoogleMark />
            Continuer avec Google
          </button>
          <p className="caption mt-2">Première fois ? Le compte est créé au passage, sans mot de passe à retenir.</p>
          <div className="my-5 flex items-center gap-3 text-[0.8125rem] text-ivory-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            ou avec une adresse
            <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>
        </>
      )}
      <form onSubmit={run("in")} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="caption">Adresse électronique</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-[var(--glass-bg)] px-3 outline-none focus:border-[var(--accent-line)]"
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
            className="min-h-11 rounded-xl border border-line bg-[var(--glass-bg)] px-3 outline-none focus:border-[var(--accent-line)]"
          />
        </label>
        {message && (
          <p role={message.error ? "alert" : "status"} className={message.error ? "text-danger" : "text-ivory-2"}>
            {message.text}
          </p>
        )}
        <Captcha onToken={setCaptcha} resetKey={attempt} />
        <p className="caption">
          En continuant, vous acceptez les{" "}
          <Link to="/conditions-utilisation" className="underline underline-offset-4 hover:text-ivory">
            conditions d'utilisation
          </Link>{" "}
          et la{" "}
          <Link to="/confidentialite" className="underline underline-offset-4 hover:text-ivory">
            politique de confidentialité
          </Link>
          .
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="submit" disabled={busy || needsCaptcha} className="btn btn-primary">
            Se connecter
          </button>
          <button type="button" disabled={busy || needsCaptcha || !email || password.length < 6} onClick={() => void run("up")()} className="btn btn-ghost">
            Créer un compte
          </button>
        </div>
      </form>
    </Panel>
  );
}

