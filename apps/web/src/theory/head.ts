// Balises de référencement de chaque page : titre, description, indexation,
// adresse canonique, données structurées. Utilisé à l'identique par le
// pré-rendu statique et par le navigateur.

import { type NodeView, catalog, nodeView } from "./engine";
import { factValue, labelOf } from "./labels";
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

const SITE_NAME = "Harmonia";

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
      "Harmonia relie les notes, gammes, accords et tonalités sur une même carte : cherchez un élément, écoutez-le, voyez-le au piano et à la guitare, suivez ses relations.";
    return {
      title: `${SITE_NAME} : explorer la théorie musicale, notes, gammes et accords`,
      description,
      indexable: true,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: SITE_NAME,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "fr",
        description,
        ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
      },
    };
  }

  const id = idOf(path);
  const view = id ? nodeView(id) : null;
  if (!view) {
    return {
      title: `${path === "/settings" ? "Réglages" : "Page introuvable"} | ${SITE_NAME}`,
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
