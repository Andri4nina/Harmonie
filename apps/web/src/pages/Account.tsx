import { useEffect } from "react";
import { Link } from "react-router";
import { useOnline } from "../app/platform";
import { accountsConfigured, signOut, startSession, useSession } from "../app/session";
import { Loader } from "../components/Loader";
import { SignIn } from "../components/SignIn";
import { Panel } from "../components/ui";

const PROVIDER: Record<string, string> = { google: "compte Google", email: "adresse et mot de passe" };

/** Ce qu'Harmonie garde d'un compte, dit simplement. */
function Privacy() {
  return (
    <Panel title="Vos données" framed={false} className="max-w-[62ch]">
      <ul className="flex list-disc flex-col gap-2 pl-5 text-ivory-2">
        <li>
          Le compte ne sert qu'à ranger vos morceaux analysés. Explorer, apprendre, entraîner l'oreille et composer
          se font sans compte.
        </li>
        <li>
          Avec Google, Harmonie ne demande que l'identité de base : votre adresse, votre nom et votre photo, que le
          service d'authentification (Supabase) enregistre pour vous reconnaître. Aucun accès à vos courriels, à vos
          fichiers ni à vos contacts.
        </li>
        <li>Rien n'est vendu, partagé ni utilisé pour de la publicité ; il n'y a ni pistage ni statistiques de visite.</li>
        <li>Vos progrès, réglages et compositions restent dans votre navigateur ou votre application.</li>
      </ul>
    </Panel>
  );
}

export function Account() {
  useEffect(startSession, []);
  const { ready, token, email, provider } = useSession();
  const online = useOnline();

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2.1rem,6vw,3.5rem)] leading-none font-semibold tracking-[-0.015em]">Compte</h1>
      </section>
      {!accountsConfigured() ? (
        <p className="max-w-[62ch] text-ivory-2">
          Les comptes ne sont pas encore activés sur ce site. Tout le reste d'Harmonie fonctionne sans compte.
        </p>
      ) : !online ? (
        <p className="max-w-[62ch] text-ivory-2">Vous êtes hors connexion : la connexion reviendra avec le réseau.</p>
      ) : !ready ? (
        <Loader label="Lecture de la session" />
      ) : token ? (
        <Panel title="Connecté" className="max-w-md">
          <p className="text-ivory-2">
            {email}
            {provider && PROVIDER[provider] ? <span className="text-ivory-3">, par {PROVIDER[provider]}</span> : null}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/bibliotheque" className="btn btn-primary">
              Ma bibliothèque
            </Link>
            <button type="button" onClick={() => void signOut()} className="btn btn-ghost">
              Se déconnecter
            </button>
          </div>
        </Panel>
      ) : (
        <SignIn intro="Connectez-vous ou créez un compte pour garder vos morceaux analysés." />
      )}
      <Privacy />
    </div>
  );
}
