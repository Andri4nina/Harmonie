import { describe, expect, it } from "vitest";
import { catalog } from "./engine";
import { headFor } from "./head";
import { detailLabel, factValue, hueOf, labelOf, shortLabelOf } from "./labels";
import { pathOf } from "./routes";

describe("balises de référencement", () => {
  it("décrit une page d'accord avec ses notes", () => {
    const head = headFor("/accords/la-mineur-7");
    expect(head.title).toBe("Accord Am7 : notes, renversements et positions | Andrianina Rasoamanana - Harmonie");
    expect(head.description).toContain("A C E G");
    expect(head.indexable).toBe(true);
    expect(head.path).toBe("/accords/la-mineur-7");
    expect(head.jsonLd).toMatchObject({ "@type": "DefinedTerm", name: "Am7" });
  });

  it("n'indexe ni les variantes hors catalogue ni les pages d'application", () => {
    expect(headFor("/accords/la-mineur-7-sur-sol").indexable).toBe(false);
    expect(headFor("/progressions/pop-en-re-majeur").indexable).toBe(false);
    expect(headFor("/settings").indexable).toBe(false);
    expect(headFor("/nimporte/quoi").indexable).toBe(false);
    expect(headFor("/").indexable).toBe(true);
  });

  it("porte le nom de l'auteur sur l'accueil et la page de téléchargement", () => {
    const home = headFor("/");
    expect(home.title).toBe("Andrianina Rasoamanana - Harmonie");
    expect(home.description).toContain("Andrianina Rasoamanana");
    expect(JSON.stringify(home.jsonLd)).toContain('"name":"Andrianina Rasoamanana"');
    const downloads = headFor("/telecharger");
    expect(downloads.indexable).toBe(true);
    expect(downloads.title).toContain("Andrianina Rasoamanana - Harmonie");
    expect(downloads.description).toContain("APK");
  });

  it("donne à chaque page du catalogue un titre et une description uniques", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const id of catalog()) {
      const head = headFor(pathOf(id));
      expect(head.indexable, id).toBe(true);
      expect(head.description.length, id).toBeGreaterThan(60);
      expect(head.description, id).not.toMatch(/undefined|NaN/);
      titles.add(head.title);
      descriptions.add(head.description);
    }
    expect(titles.size).toBe(catalog().length);
    expect(descriptions.size).toBe(catalog().length);
  });
});

describe("libellés", () => {
  it("nomme les éléments en français", () => {
    expect(labelOf("scale:D:dorian")).toBe("D dorien");
    expect(labelOf("key:A:minor")).toBe("A mineur");
    expect(labelOf("chord:Am7/G")).toBe("Am7/G");
    expect(labelOf("progression:andalusian:A:minor")).toBe("Cadence andalouse en A mineur");
    expect(shortLabelOf("key:A:minor")).toBe("Am");
    expect(shortLabelOf("scale:C:lydian")).toBe("C lyd");
  });

  it("met en mots les précisions et les faits", () => {
    expect(detailLabel("chords", "M3")).toBe("tierce majeure");
    expect(detailLabel("keys", "5")).toBe("degré 5");
    expect(detailLabel("related_keys", "relative")).toBe("relatif");
    expect(detailLabel("modes", null)).toBeNull();
    expect(factValue("signature", "3b")).toBe("3 bémols");
    expect(factValue("signature", "1#")).toBe("1 dièse");
    expect(factValue("signature", "0")).toBe("aucune altération");
    expect(factValue("relative", "key:C:minor")).toBe("C mineur");
    expect(factValue("inversion", "0")).toBe("état fondamental");
  });

  it("colore les notes selon le cercle des quintes", () => {
    const step = (a: number, b: number) => (hueOf(b) - hueOf(a) + 360) % 360;
    // Deux notes à la quinte ont des teintes voisines, en tournant toujours
    // dans le même sens ; un seul saut plus grand, celui qui évite le vert.
    const steps = Array.from({ length: 12 }, (_, i) => step((i * 7) % 12, ((i + 1) * 7) % 12));
    expect(steps.reduce((sum, value) => sum + value, 0)).toBe(360);
    expect(steps.filter((value) => value > 40)).toHaveLength(1);
    expect(step(0, 7)).toBeLessThan(40);
    expect(new Set(Array.from({ length: 12 }, (_, pc) => hueOf(pc))).size).toBe(12);
  });
});
