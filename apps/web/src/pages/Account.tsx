import { useEffect } from "react";
import { Link } from "react-router";
import { useOnline } from "../app/platform";
import { accountsConfigured, signOut, startSession, useSession } from "../app/session";
import { useStoredAccount } from "../app/sessionHint";
import { useSync } from "../app/syncMeta";
import { Avatar } from "../components/AccountMenu";
import { Loader } from "../components/Loader";
import { SignIn } from "../components/SignIn";
import { Notice, Panel } from "../components/ui";

const PROVIDER: Record<string, string> = { google: "compte Google", email: "adresse et mot de passe" };

/** Ce qu'Harmonie garde d'un compte, dit simplement. */
function Privacy() {
  return (
    <Panel title="Vos données" framed={false} className="max-w-[62ch] lg:pt-2">
      <ul className="flex list-disc flex-col gap-2 pl-5 text-ivory-2">
        <li>
          Tout se fait d'abord sur votre appareil, même hors connexion. Le compte sert à retrouver vos réglages,
          cours, progrès d'oreille, compositions et morceaux analysés sur vos autres appareils.
        </li>
        <li>
          Avec Google, Harmonie ne demande que l'identité de base : votre adresse, votre nom et votre photo, que le
          service d'authentification (Supabase) enregistre pour vous reconnaître. Aucun accès à vos courriels, à vos
          fichiers ni à vos contacts.
        </li>
        <li>Rien n'est vendu, partagé ni utilisé pour de la publicité ; il n'y a ni pistage ni statistiques de visite.</li>
        <li>Sans compte, rien ne quitte votre appareil.</li>
      </ul>
    </Panel>
  );
}

export function Account() {
  useEffect(startSession, []);
  const { ready, token, email, provider } = useSession();
  const online = useOnline();
  const account = useStoredAccount();
  const sync = useSync();

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2.1rem,6vw,3.5rem)] leading-none font-semibold tracking-[-0.015em]">Compte</h1>
      </section>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      {!accountsConfigured() ? (
        <Notice title="Les comptes ne sont pas encore activés sur ce site">
          Tout le reste d'Harmonie fonctionne sans compte, et vos progrès restent sur cet appareil.
        </Notice>
      ) : !online && !token ? (
        <Notice title="Hors connexion">La connexion reviendra avec le réseau. Vos progrès restent sur cet appareil.</Notice>
      ) : !ready ? (
        <Loader label="Lecture de la session" />
      ) : token ? (
        <Panel className="rise-in">
          <div className="flex items-center gap-4">
            {account && <Avatar account={account} className="pop-in size-16" />}
            <div className="min-w-0">
              {account?.name && <p className="font-display truncate text-lg font-semibold">{account.name}</p>}
              <p className="truncate text-ivory-2">{email}</p>
              {provider && PROVIDER[provider] && <p className="caption">Connecté par {PROVIDER[provider]}</p>}
            </div>
          </div>
          <p className="caption mt-5">
            {sync.status === "synced"
              ? "Réglages, cours, oreille et Composer sont synchronisés avec ce compte."
              : sync.status === "offline"
                ? "Hors connexion : tout est gardé ici et partira au retour du réseau."
                : sync.status === "error"
                  ? "Le serveur ne répond pas : tout est gardé ici, nouvel essai dans une minute."
                  : "Synchronisation avec ce compte…"}
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
        <SignIn intro="Connectez-vous pour retrouver vos réglages, vos cours, vos progrès et vos compositions sur tous vos appareils." />
      )}
      <Privacy />
      </div>
    </div>
  );
}
