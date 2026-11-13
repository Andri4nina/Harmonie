// Balises de référencement de chaque page : titre, description, indexation,
// adresse canonique, données structurées. Utilisé à l'identique par le
// pré-rendu statique et par le navigateur.

import { type NodeView, catalog, nodeView } from "./engine";
import { factValue, labelOf } from "./labels";
import { lessonBySlug } from "./lessons";
import { idOf, normalizePath, pathOf } from "./routes";

export interface Head {
  title: string;
  description: string;
  /** Faux pour les pages d'application et les variantes hors catalogue. */
  indexable: boolean;
  /** Adresse canonique, sans domaine. */
  path: string;
  jsonLd: Record<string, unknown> | null;
}

/** Adresse publique du site (sans barre finale), si elle est connue au build. */
export const SITE_URL: string | undefined = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "");

/** Nom affiché dans les résultats de recherche. */
export const SITE_NAME = "Andrianina Rasoamanana - Harmonie";
export const AUTHOR = "Andrianina Rasoamanana";

const author = {
  "@type": "Person",
  name: AUTHOR,
  sameAs: ["https://github.com/Andri4nina"],
};

/** Données structurées communes : le site et son auteur. */
function website(description: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        alternateName: ["Harmonie", "Harmonie Andrianina Rasoamanana", "Andrianina Rasoamanana Harmonie"],
        inLanguage: "fr",
        description,
        author,
        creator: author,
        ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
      },
      {
        "@type": "WebApplication",
        name: "Harmonie",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web, Windows, macOS, Linux, Android",
        inLanguage: "fr",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        codeRepository: "https://github.com/Andri4nina/Harmonie",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        description,
        author,
        ...(SITE_URL ? { url: `${SITE_URL}/`, downloadUrl: `${SITE_URL}/telecharger` } : {}),
      },
      { ...author, url: "https://github.com/Andri4nina" },
    ],
  };
}

let catalogIds: Set<string> | undefined;

function inCatalog(id: string): boolean {
  catalogIds ??= new Set(catalog());
  return catalogIds.has(id);
}

function fact(view: NodeView, key: string): string {
  const found = view.facts.find((candidate) => candidate.key === key);
  return found ? factValue(key, found.value) : "";
}

function count(view: NodeView, group: string): number {
  return view.groups.find((candidate) => candidate.key === group)?.items.length ?? 0;
}

/** Phrase de présentation d'un élément, affichée sur sa page et reprise en description. */
export function introOf(view: NodeView): string {
  const label = labelOf(view.id);
  switch (view.kind) {
    case "note":
      return `La note ${label} vibre à ${fact(view, "frequency")} dans l'octave centrale. Elle appartient à ${count(view, "keys")} tonalités et à ${count(view, "chords")} accords usuels : écoutez-la, repérez-la au piano et sur le manche, puis suivez ses relations.`;
    case "scale":
      return `La gamme de ${label} contient les notes ${fact(view, "notes")} (formule ${fact(view, "formula")}). Écoutez-la, voyez-la au piano et sur le manche, et découvrez ses accords.`;
    case "chord":
      return `L'accord ${label} est formé des notes ${fact(view, "notes")} (formule ${fact(view, "formula")}). Écoutez-le, voyez ses positions au piano et à la guitare, et les tonalités où il apparaît.`;
    case "key":
      return `La tonalité de ${label} utilise les notes ${fact(view, "notes")} (armure : ${fact(view, "signature")}). Découvrez ses sept accords, ses tons voisins et ses progressions usuelles.`;
    case "progression":
      return `${label} : degrés ${fact(view, "numerals")}, soit les accords ${fact(view, "chords")}. Écoutez la progression et explorez chacun de ses accords.`;
  }
}

function titleOf(view: NodeView): string {
  const label = labelOf(view.id);
  switch (view.kind) {
    case "note":
      return `Note ${label} : gammes, accords et tonalités`;
    case "scale":
      return `Gamme de ${label} : notes, accords et positions`;
    case "chord":
      return `Accord ${label} : notes, renversements et positions`;
    case "key":
      return `Tonalité de ${label} : armure, gamme et accords`;
    case "progression":
      return `${label} : accords et degrés`;
  }
}

export function headFor(pathname: string): Head {
  const path = normalizePath(pathname);
  if (path === "/") {
    const description =
      "Harmonie, par Andrianina Rasoamanana : la théorie musicale qu'on entend. Notes, gammes, accords et tonalités à écouter et à voir au piano et à la guitare, entraînement de l'oreille, analyse de morceaux et séquenceur. Libre et gratuit.";
    return { title: SITE_NAME, description, indexable: true, path, jsonLd: website(description) };
  }
  if (path === "/tableau-de-bord") {
    const description = "Votre tableau de bord Harmonie : points de départ dans la théorie, pages visitées et progression.";
    return { title: `Tableau de bord | ${SITE_NAME}`, description, indexable: false, path, jsonLd: website(description) };
  }
  if (path === "/cours") {
    const description =
      "Cours de théorie musicale gratuits et interactifs : notes, intervalles, gammes, accords, degrés et cadences, à écouter et à vérifier par l'oreille. Par Andrianina Rasoamanana.";
    return { title: `Cours de théorie musicale interactifs | ${SITE_NAME}`, description, indexable: true, path, jsonLd: website(description) };
  }
  const lesson = path.startsWith("/cours/") ? lessonBySlug(path.slice("/cours/".length)) : undefined;
  if (lesson) {
    return {
      title: `${lesson.title} : cours de théorie musicale | ${SITE_NAME}`,
      description: lesson.summary,
      indexable: true,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "LearningResource",
        name: lesson.title,
        description: lesson.summary,
        learningResourceType: "Cours interactif",
        educationalLevel: lesson.level,
        inLanguage: "fr",
        isAccessibleForFree: true,
        author,
        isPartOf: { "@type": "Course", name: "Théorie musicale avec Harmonie", provider: author },
        ...(SITE_URL ? { url: `${SITE_URL}${path}` } : {}),
      },
    };
  }
  if (path === "/composer") {
    const description =
      "Séquenceur en ligne gratuit : générez accords, mélodie, basse et batterie, retouchez-les au rouleau de piano et au pas à pas, jouez au clavier d'ordinateur, puis exportez en MIDI. Par Andrianina Rasoamanana.";
    return {
      title: `Séquenceur et générateur d'accords, rouleau de piano, export MIDI | ${SITE_NAME}`,
      description,
      indexable: true,
      path,
      jsonLd: website(description),
    };
  }
  if (path === "/oreille") {
    const description =
      "Entraînement de l'oreille musicale gratuit : reconnaître les intervalles, les accords, les degrés et les progressions, par niveaux, avec répétition espacée. Par Andrianina Rasoamanana.";
    return {
      title: `Entraînement de l'oreille : intervalles, accords, progressions | ${SITE_NAME}`,
      description,
      indexable: true,
      path,
      jsonLd: website(description),
    };
  }
  if (path === "/telecharger") {
    const description =
      "Télécharger Harmonie d'Andrianina Rasoamanana pour Windows, macOS, Linux et Android (APK) : la théorie musicale interactive, même hors connexion.";
    return {
      title: `Télécharger Harmonie pour ordinateur et Android | ${SITE_NAME}`,
      description,
      indexable: true,
      path,
      jsonLd: website(description),
    };
  }

  const id = idOf(path);
  const view = id ? nodeView(id) : null;
  if (!view) {
    const APP_PAGES: Record<string, string> = {
      "/settings": "Réglages",
      "/analyser": "Analyser un morceau",
      "/bibliotheque": "Ma bibliothèque",
    };
    const appTitle = APP_PAGES[path] ?? (path.startsWith("/analyser/") ? "Analyse d'un morceau" : "Page introuvable");
    return {
      title: `${appTitle} | ${SITE_NAME}`,
      description: "",
      indexable: false,
      path,
      jsonLd: null,
    };
  }

  const canonical = pathOf(view.id);
  const description = introOf(view);
  return {
    title: `${titleOf(view)} | ${SITE_NAME}`,
    description,
    indexable: inCatalog(view.id),
    path: canonical,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: labelOf(view.id),
      description,
      inDefinedTermSet: "Théorie musicale",
      inLanguage: "fr",
      author,
      isPartOf: { "@type": "WebSite", name: SITE_NAME },
      ...(SITE_URL ? { url: `${SITE_URL}${canonical}` } : {}),
    },
  };
}

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  const existing = document.head.querySelector<HTMLElement>(selector);
  if (existing) return existing;
  const element = create();
  document.head.append(element);
  return element;
}

/** Met les balises du document à jour après une navigation côté client. */
export function applyHead(head: Head): void {
  document.title = head.title;
  const meta = (name: string) =>
    upsert(`meta[name="${name}"]`, () => Object.assign(document.createElement("meta"), { name }));
  meta("description").setAttribute("content", head.description);
  meta("robots").setAttribute("content", head.indexable ? "index,follow" : "noindex");
  const canonical = upsert('link[rel="canonical"]', () =>
    Object.assign(document.createElement("link"), { rel: "canonical" }),
  );
  canonical.setAttribute("href", `${SITE_URL ?? window.location.origin}${head.path}`);
  const structured = upsert('script[type="application/ld+json"]', () =>
    Object.assign(document.createElement("script"), { type: "application/ld+json" }),
  );
  structured.textContent = head.jsonLd ? JSON.stringify(head.jsonLd) : "";
}
