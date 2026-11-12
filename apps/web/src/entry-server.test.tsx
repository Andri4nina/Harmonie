import { describe, expect, it } from "vitest";
import { pages, render } from "./entry-server";

describe("pré-rendu", () => {
  it("liste l'accueil et tout le catalogue, sans doublon", () => {
    const all = pages();
    expect(all[0]).toBe("/");
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("/accords/la-mineur-7");
    expect(all).toContain("/gammes/la-blues");
    expect(all).toContain("/tonalites/fa-diese-majeur");
  });

  it("rend une page d'accord complète sans navigateur", () => {
    const { html, head, hue } = render("/accords/la-mineur-7");
    expect(html).toMatch(/<h1[^>]*>Am7<\/h1>/);
    expect(html).toContain("Écouter l&#x27;accord");
    expect(html).toContain('aria-label="Graphe des relations"');
    expect(html).toContain('aria-label="Cercle des quintes"');
    expect(html).toContain("Clavier : A, C, E, G");
    expect(html).toContain("Saxophone alto");
    // Les relations sont de vrais liens vers d'autres pages de référence.
    expect(html).toContain('href="/notes/la"');
    expect(html).toContain('href="/tonalites/do-majeur"');
    expect(head.title).toContain("Am7");
    expect(hue).toBeGreaterThanOrEqual(0);
  });

  it("rend l'accueil et signale une adresse inconnue", () => {
    expect(render("/").html).toContain("Voyez ce qui relie les notes.");
    const missing = render("/accords/do-inexistant");
    expect(missing.html).toContain("Page introuvable");
    expect(missing.head.indexable).toBe(false);
  });

  it("produit un seul titre principal par page", () => {
    for (const path of ["/", "/notes/do", "/gammes/re-dorien", "/tonalites/la-mineur", "/progressions/pop-en-do-majeur"]) {
      expect(render(path).html.match(/<h1/g)?.length, path).toBe(1);
    }
  });
});
