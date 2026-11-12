import { describe, expect, it } from "vitest";
import { catalog, nodeView } from "./engine";
import { idOf, normalizePath, pathOf } from "./routes";

describe("adresses des pages de référence", () => {
  it("écrit des adresses lisibles en français", () => {
    expect(pathOf("note:C#")).toBe("/notes/do-diese");
    expect(pathOf("note:Bb")).toBe("/notes/si-bemol");
    expect(pathOf("scale:D:dorian")).toBe("/gammes/re-dorien");
    expect(pathOf("scale:A:harmonic_minor")).toBe("/gammes/la-mineure-harmonique");
    expect(pathOf("key:Eb:major")).toBe("/tonalites/mi-bemol-majeur");
    expect(pathOf("chord:C")).toBe("/accords/do-majeur");
    expect(pathOf("chord:Am7")).toBe("/accords/la-mineur-7");
    expect(pathOf("chord:F#m7b5/A")).toBe("/accords/fa-diese-demi-diminue-sur-la");
    expect(pathOf("chord:Bb7#5")).toBe("/accords/si-bemol-7-quinte-augmentee");
    expect(pathOf("progression:two-five-one:C:major")).toBe("/progressions/two-five-one-en-do-majeur");
  });

  it("retrouve l'identifiant de chaque page du catalogue", () => {
    const ids = catalog();
    expect(ids.length).toBeGreaterThan(500);
    const paths = new Set<string>();
    for (const id of ids) {
      const path = pathOf(id);
      expect(idOf(path), path).toBe(id);
      expect(path).toMatch(/^\/[a-z]+\/[a-z0-9-]+$/);
      paths.add(path);
    }
    expect(paths.size).toBe(ids.length);
  });

  it("gère les renversements, basses étrangères et doubles altérations", () => {
    for (const id of ["chord:Am7/G", "chord:C/D", "chord:Dbmaj7/Ab", "note:Ebb", "note:F##", "chord:Cdim7/Bbb"]) {
      expect(idOf(pathOf(id)), id).toBe(id);
      expect(nodeView(id), id).not.toBeNull();
    }
  });

  it("refuse les adresses qui ne désignent rien", () => {
    for (const path of ["/", "/settings", "/notes", "/notes/ut", "/notes/do-majeur", "/accords/do", "/accords/do-truc",
      "/gammes/do-inconnue", "/tonalites/do", "/progressions/pop", "/notes/do/extra", "/accords/do-majeur-sur"]) {
      expect(idOf(path), path).toBeNull();
    }
  });

  it("ignore la barre finale", () => {
    expect(normalizePath("/accords/do-majeur/")).toBe("/accords/do-majeur");
    expect(normalizePath("/")).toBe("/");
    expect(idOf("/notes/sol/")).toBe("note:G");
  });
});
