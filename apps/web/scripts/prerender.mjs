// Pré-rendu statique : écrit un fichier HTML complet par page de référence,
// avec ses balises de référencement, puis sitemap.xml et robots.txt.
//
// À lancer après `vite build` et `vite build --ssr` (voir le script "build").
// VITE_SITE_URL (ex. https://harmonia.example.org) fixe les adresses absolues ;
// sans elle, ni adresse canonique absolue ni plan de site ne sont produits.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(web, "dist");
const siteUrl = process.env.VITE_SITE_URL?.replace(/\/+$/, "");
// Jeton de validation de Google Search Console (facultatif).
const verification = process.env.VITE_GOOGLE_SITE_VERIFICATION;

const { setup, pages, render } = await import(pathToFileURL(resolve(web, "dist-ssr/entry-server.js")).href);
setup(readFileSync(resolve(web, "src/theory/pkg/harmonia_theory_wasm_bg.wasm")));

// Les deux polices du texte courant sont préchargées : le titre principal
// s'affiche d'emblée dans sa police définitive.
const preloads = readdirSync(resolve(dist, "assets"))
  .filter((file) => /^(unbounded|syne)-latin-wght-normal-.*\.woff2$/.test(file))
  .map((file) => `<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin />`)
  .join("\n    ");
const template = readFileSync(resolve(dist, "index.html"), "utf8").replace(
  "</title>",
  `</title>\n    ${preloads}`,
);
const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Coquille sans contenu, servie par l'hébergeur pour toute adresse non
// pré-rendue (variantes hors catalogue, réglages) : l'application s'y monte.
const shell = template.replace("</head>", '    <meta name="robots" content="noindex" />\n  </head>');
writeFileSync(resolve(dist, "200.html"), shell);
writeFileSync(resolve(dist, "404.html"), shell);

const indexed = [];
for (const path of pages()) {
  const { html, head, hue } = render(path);
  const tags = [
    `<meta name="robots" content="${head.indexable ? "index,follow" : "noindex"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Andrianina Rasoamanana - Harmonie" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${escape(head.title)}" />`,
    `<meta property="og:description" content="${escape(head.description)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(head.title)}" />`,
    `<meta name="twitter:description" content="${escape(head.description)}" />`,
  ];
  if (verification) tags.push(`<meta name="google-site-verification" content="${escape(verification)}" />`);
  if (siteUrl) {
    tags.push(`<link rel="canonical" href="${siteUrl}${head.path}" />`);
    tags.push(`<meta property="og:url" content="${siteUrl}${head.path}" />`);
    tags.push(`<meta property="og:image" content="${siteUrl}/og-image.png" />`);
    tags.push(`<meta property="og:image:width" content="1200" />`, `<meta property="og:image:height" content="630" />`);
    tags.push(`<meta property="og:image:alt" content="Andrianina Rasoamanana - Harmonie" />`);
    tags.push(`<meta name="twitter:image" content="${siteUrl}/og-image.png" />`);
  }
  if (head.jsonLd) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(head.jsonLd).replaceAll("<", "\\u003c")}</script>`);
  }

  const page = template
    .replace('<html lang="fr">', `<html lang="fr" style="--h:${hue}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(head.title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${escape(head.description)}" />`)
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root" data-prerendered="${escape(path)}">${html}</div>`);
  if (!page.includes("data-prerendered")) throw new Error(`Gabarit inattendu : impossible d'insérer ${path}`);

  const file = path === "/" ? resolve(dist, "index.html") : resolve(dist, `.${path}`, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page);
  if (head.indexable) indexed.push(head.path);
}

const robots = ["User-agent: *", "Disallow: /settings", "Disallow: /explorer"];
if (siteUrl) {
  const urls = indexed.map((path) => `  <url><loc>${siteUrl}${path === "/" ? "/" : path}</loc></url>`).join("\n");
  writeFileSync(
    resolve(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  robots.push(`Sitemap: ${siteUrl}/sitemap.xml`);
} else {
  console.warn("VITE_SITE_URL absente : pas d'adresse canonique absolue ni de sitemap.xml.");
}
writeFileSync(resolve(dist, "robots.txt"), `${robots.join("\n")}\n`);

console.log(`${indexed.length} pages pré-rendues dans dist/`);
