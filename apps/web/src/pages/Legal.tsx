import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Pages juridiques : mentions légales, conditions d'utilisation, politique de
 * confidentialité. Texte rédigé pour un service gratuit, non commercial, édité
 * par un particulier ; à faire relire par un professionnel du droit.
 */

export const LEGAL_UPDATED = "14 novembre 2026";
const EDITOR = "Andrianina Rasoamanana";
const SITE = "https://andrianina-rasoamanana-harmonie.vercel.app";
const REPOSITORY = "https://github.com/Andri4nina/Harmonie";
const CONTACT = `${REPOSITORY}/issues`;

/** Liens vers les trois pages, pour les pieds de page. */
export const LEGAL_LINKS = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/conditions-utilisation", label: "Conditions d'utilisation" },
  { to: "/confidentialite", label: "Confidentialité" },
];

function Page({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <article className="flex max-w-[72ch] flex-col gap-8 pt-4 sm:pt-8">
      <header>
        <h1 className="font-display engrave text-[clamp(2rem,5.4vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.015em]">{title}</h1>
        <p className="mt-4 text-ivory-2">{intro}</p>
        <p className="caption mt-2">Dernière mise à jour : {LEGAL_UPDATED}</p>
      </header>
      <div className="legal flex flex-col gap-7">{children}</div>
      <nav aria-label="Autres pages juridiques" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[0.9375rem]">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="text-brass underline-offset-4 hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-ivory-2 [&_strong]:font-medium [&_strong]:text-ivory">{children}</div>
    </section>
  );
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener" className="text-brass underline underline-offset-4">
      {children}
    </a>
  );
}

const HOSTS = [
  { role: "Site web", name: "Vercel Inc.", address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis", url: "https://vercel.com" },
  { role: "Serveur d'analyse (API)", name: "Render Inc.", address: "San Francisco, Californie, États-Unis", url: "https://render.com" },
  {
    role: "Comptes, base de données et fichiers audio",
    name: "Supabase Pte. Ltd.",
    address: "65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513 ; données hébergées à Londres (Royaume-Uni)",
    url: "https://supabase.com",
  },
];

export function LegalNotice() {
  return (
    <Page title="Mentions légales" intro="Qui publie Harmonie, où le site est hébergé et comment nous joindre.">
      <Section title="Éditeur">
        <p>
          Harmonie ({SITE}) est édité à titre personnel et non commercial par <strong>{EDITOR}</strong>, particulier,
          qui en est aussi le directeur de la publication.
        </p>
        <p>
          Contact : par le suivi des demandes du projet, <External href={CONTACT}>{CONTACT.replace("https://", "")}</External>.
        </p>
      </Section>
      <Section title="Hébergement">
        <ul className="flex flex-col gap-3">
          {HOSTS.map((host) => (
            <li key={host.name}>
              <strong>{host.role}</strong> : {host.name}, {host.address} (<External href={host.url}>{host.url.replace("https://", "")}</External>).
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Propriété intellectuelle">
        <p>
          Le code d'Harmonie est un logiciel libre publié sous licence <strong>GNU AGPL-3.0 ou ultérieure</strong> :{" "}
          <External href={REPOSITORY}>{REPOSITORY.replace("https://", "")}</External>. Vous pouvez l'utiliser, l'étudier,
          le modifier et le redistribuer selon les termes de cette licence.
        </p>
        <p>
          Le nom « Harmonie », le logo et les textes des cours sont l'œuvre de {EDITOR}. Les notions de théorie musicale
          présentées appartiennent au domaine commun. Les morceaux que vous déposez restent les vôtres (voir les{" "}
          <Link to="/conditions-utilisation" className="text-brass underline underline-offset-4">
            conditions d'utilisation
          </Link>
          ).
        </p>
      </Section>
      <Section title="Signaler un contenu">
        <p>
          Pour signaler un contenu illicite ou une atteinte à vos droits, écrivez par le suivi des demandes en décrivant
          le contenu et son adresse. Le signalement est traité dans les meilleurs délais.
        </p>
      </Section>
    </Page>
  );
}

export function TermsOfUse() {
  return (
    <Page title="Conditions d'utilisation" intro="Les règles d'usage d'Harmonie, en clair. Utiliser le site ou les applications vaut acceptation de ces conditions.">
      <Section title="1. Le service">
        <p>
          Harmonie est un outil gratuit d'apprentissage et de pratique de la théorie musicale : explorer notes, gammes et
          accords, suivre des cours, entraîner son oreille, composer, et analyser des enregistrements. Il est fourni tel
          quel, sans garantie de disponibilité continue, et peut évoluer ou s'interrompre.
        </p>
      </Section>
      <Section title="2. Compte">
        <p>
          Les outils (tableau de bord, oreille, Composer, analyse, réglages) demandent un compte, créé avec une adresse
          électronique ou un compte Google. Vous êtes responsable de la confidentialité de vos accès et de ce qui est
          fait depuis votre compte. Un compte est personnel.
        </p>
        <p>
          Vous pouvez demander la suppression de votre compte et de vos données à tout moment (voir la{" "}
          <Link to="/confidentialite" className="text-brass underline underline-offset-4">
            politique de confidentialité
          </Link>
          ).
        </p>
      </Section>
      <Section title="3. Morceaux déposés pour analyse">
        <p>
          <strong>Ne déposez que des enregistrements que vous avez le droit d'utiliser</strong> : vos propres créations,
          des œuvres libres de droits, ou des œuvres pour lesquelles vous disposez d'une autorisation. L'analyse est faite
          pour votre usage personnel ; les fichiers et leurs analyses restent privés et ne sont ni publiés ni partagés.
        </p>
        <p>
          Vous restez seul responsable des fichiers que vous déposez. Tout fichier signalé comme portant atteinte aux
          droits d'un tiers pourra être supprimé.
        </p>
      </Section>
      <Section title="4. Analyses et contenus pédagogiques">
        <p>
          Les analyses (tonalité, accords, tempo, mélodie) sont calculées automatiquement : elles sont <strong>indicatives</strong>,
          affichent leur degré de certitude et peuvent être fausses. Les notes de mélodie sont estimées. Vérifiez à l'oreille
          avant de vous y fier, notamment pour un usage professionnel.
        </p>
      </Section>
      <Section title="5. Usages interdits">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>perturber le service : envois massifs, robots, contournement de la vérification anti-robots, surcharge volontaire ;</li>
          <li>tenter d'accéder aux comptes ou aux données d'autres personnes ;</li>
          <li>déposer des fichiers illicites, malveillants ou sans rapport avec la musique ;</li>
          <li>revendre l'accès au service. La réutilisation du code reste libre, selon la licence AGPL-3.0.</li>
        </ul>
        <p>Un compte qui enfreint ces règles peut être suspendu ou supprimé.</p>
      </Section>
      <Section title="6. Responsabilité">
        <p>
          Harmonie étant un service gratuit et bénévole, l'éditeur ne peut être tenu responsable des interruptions, pertes
          de données ou dommages indirects liés à son utilisation, dans les limites permises par la loi. Gardez une copie
          de vos fichiers et exportez vos compositions (MIDI) si elles vous sont précieuses.
        </p>
      </Section>
      <Section title="7. Modifications et droit applicable">
        <p>
          Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. En cas de litige, une solution
          amiable sera recherchée en priorité. Les règles impératives protégeant les consommateurs de votre pays de
          résidence s'appliquent dans tous les cas.
        </p>
      </Section>
    </Page>
  );
}

const PROCESSORS = [
  { name: "Supabase", purpose: "comptes, base de données, fichiers audio", where: "Royaume-Uni (Londres)" },
  { name: "Render", purpose: "serveur d'analyse", where: "Union européenne (Francfort)" },
  { name: "Vercel", purpose: "diffusion du site", where: "réseau mondial ; société américaine" },
  { name: "Google", purpose: "connexion avec un compte Google, si vous la choisissez", where: "États-Unis" },
  { name: "Cloudflare", purpose: "vérification anti-robots à la connexion", where: "réseau mondial ; société américaine" },
];

export function PrivacyPolicy() {
  return (
    <Page title="Confidentialité" intro="Ce qu'Harmonie garde de vous, pourquoi, et comment le récupérer ou l'effacer. En bref : le strict nécessaire, rien n'est vendu, aucun pistage.">
      <Section title="Responsable du traitement">
        <p>
          {EDITOR}, éditeur d'Harmonie. Contact : <External href={CONTACT}>{CONTACT.replace("https://", "")}</External>.
        </p>
      </Section>
      <Section title="Sans compte">
        <p>
          Explorer la théorie, lire les cours et la présentation ne demandent aucune donnée. Vos réglages restent dans votre
          navigateur (stockage local) et ne quittent pas votre appareil. Aucun cookie publicitaire, aucune mesure d'audience,
          aucun pistage.
        </p>
      </Section>
      <Section title="Avec un compte">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Identité</strong> : votre adresse électronique ; avec Google, aussi votre nom et votre photo de profil.
            Aucun accès à vos courriels, fichiers ou contacts Google.
          </li>
          <li>
            <strong>Vos données d'usage</strong> : réglages, cours terminés, progrès de l'entraînement de l'oreille, projet en
            cours dans Composer, synchronisés pour les retrouver sur vos appareils.
          </li>
          <li>
            <strong>Vos morceaux</strong> : les fichiers audio déposés et leurs analyses, visibles de vous seul.
          </li>
        </ul>
        <p>
          Finalité unique : faire fonctionner le service que vous utilisez. Base légale : l'exécution du service demandé
          (article 6.1.b du RGPD). Rien n'est vendu, loué, ni utilisé pour de la publicité ou du profilage.
        </p>
      </Section>
      <Section title="Durée de conservation">
        <p>
          Tant que votre compte existe. À sa suppression, vos données et vos fichiers sont effacés ; les copies de sauvegarde
          des prestataires disparaissent ensuite selon leurs propres cycles (quelques semaines au plus).
        </p>
      </Section>
      <Section title="Prestataires">
        <p>Ces services traitent des données pour le compte d'Harmonie, chacun pour sa fonction :</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <strong>{processor.name}</strong> : {processor.purpose} ({processor.where}).
            </li>
          ))}
        </ul>
        <p>
          Certains sont établis hors de l'Union européenne ; les transferts s'appuient sur leurs garanties contractuelles
          (clauses contractuelles types de la Commission européenne ou décision d'adéquation).
        </p>
      </Section>
      <Section title="Stockage local et cookies">
        <p>
          Harmonie utilise le stockage local du navigateur pour ce qui est indispensable : votre session de connexion, vos
          réglages, vos progrès et vos compositions. Ces éléments sont nécessaires au service et ne demandent pas de
          consentement. La vérification anti-robots de Cloudflare peut déposer un élément technique le temps de la
          vérification.
        </p>
      </Section>
      <Section title="Vos droits">
        <p>
          Vous pouvez à tout moment accéder à vos données, les corriger, les récupérer, vous opposer à leur traitement ou
          demander leur effacement complet avec la suppression de votre compte. Écrivez par le suivi des demandes ; une
          réponse est apportée dans le délai d'un mois.
        </p>
        <p>
          Vous pouvez aussi saisir l'autorité de protection des données de votre pays, en France la CNIL (
          <External href="https://www.cnil.fr">cnil.fr</External>).
        </p>
      </Section>
    </Page>
  );
}
