import { useEffect } from "react";
import "./login.css";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useOnline } from "../app/platform";
import { startSession } from "../app/session";
import { ACCOUNTS, useAccountState } from "../app/sessionHint";
import { FIFTH_PATH, Logo } from "../components/Logo";
import { SignIn } from "../components/SignIn";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { Notice } from "../components/ui";

/** Page où revenir après la connexion : une adresse interne seulement. */
export function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/tableau-de-bord";
}

/**
 * Connexion, avant d'entrer dans les outils. À gauche, la figure de la
 * quinte se trace ; à droite, Google ou l'adresse. Une fois connecté, on
 * repart vers la page demandée.
 */
export function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("suite"));
  const navigate = useNavigate();
  const { checked, account } = useAccountState();
  const online = useOnline();

  useEffect(startSession, []);
  useEffect(() => {
    if (checked && account) navigate(next, { replace: true, viewTransition: true });
  }, [checked, account, next, navigate]);

  return (
    <div className="login">
      <header className="login-bar">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Harmonie, présentation">
          <Logo className="size-9" moving />
          <span className="font-display text-[1.05rem] font-semibold">Harmonie</span>
        </Link>
        <span className="w-44">
          <ThemeSwitch compact />
        </span>
      </header>

      <section className="login-art" aria-hidden="true">
        <svg viewBox="0 0 64 64" className="login-knot">
          <path d={FIFTH_PATH} pathLength={1} className="login-line" />
          <path d={FIFTH_PATH} pathLength={1} className="login-line login-line-echo" />
          {[0, 1, 2].map((i) => (
            <circle key={i} r={1.4} className="login-head" style={{ animationDelay: `${i * 0.35}s` }}>
              <animateMotion dur="6s" begin={`${i * -2}s`} repeatCount="indefinite" path={FIFTH_PATH} />
            </circle>
          ))}
        </svg>
        <p className="login-quote font-display">
          Deux notes dans le rapport 3:2.
          <span>La quinte, la plus simple des harmonies après l'octave.</span>
        </p>
      </section>

      <main id="contenu" className="login-form">
        <div className="w-full max-w-md">
          <h1 className="login-title font-display">Entrer dans Harmonie</h1>
          <p className="mb-6 text-ivory-2">
            Un compte garde vos réglages, vos cours, vos progrès et vos compositions sur tous vos appareils. Ils restent
            aussi sur celui-ci, même hors connexion.
          </p>
          {!ACCOUNTS ? (
            <Notice title="Les comptes ne sont pas encore activés sur ce site">
              <Link to={next} className="text-brass underline underline-offset-4">
                Continuer sans compte
              </Link>
            </Notice>
          ) : !online && !account ? (
            <Notice title="Hors connexion">La première connexion demande le réseau ; ensuite, Harmonie marche sans.</Notice>
          ) : (
            <SignIn next={`/connexion?suite=${encodeURIComponent(next)}`} intro="Choisissez comment vous connecter." />
          )}
          <p className="caption mt-6">
            Les pages de théorie et les cours restent ouverts à tous :{" "}
            <Link to="/explorer" className="underline underline-offset-4 hover:text-ivory">
              explorer sans compte
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
