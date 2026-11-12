import { describe, expect, it } from "vitest";
import { exercises } from "./ear";
import { nodeView } from "./engine";
import { headFor } from "./head";
import { LESSONS, paragraphs } from "./lessons";

describe("cours", () => {
  it("sont six, dans l'ordre, avec des adresses uniques", () => {
    expect(LESSONS.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(LESSONS.map((l) => l.slug)).size).toBe(LESSONS.length);
  });

  it("ne citent que des éléments que le moteur connaît", () => {
    const levels = new Map(exercises().map((e) => [e.id, e.levels.length]));
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const nodes = "node" in step ? [step.node] : "nodes" in step ? step.nodes : [];
        for (const node of nodes) expect(nodeView(node), `${lesson.slug} : ${node}`).not.toBeNull();
        if (step.type === "question") expect(step.choices, `${lesson.slug} : ${step.prompt}`).toContain(step.answer);
        if (step.type === "quiz") expect(step.level).toBeLessThanOrEqual(levels.get(step.exercise) ?? 0);
      }
    }
  });

  it("ont chacun une page indexable et un titre unique", () => {
    const titles = new Set<string>();
    for (const lesson of LESSONS) {
      const head = headFor(`/cours/${lesson.slug}`);
      expect(head.indexable).toBe(true);
      expect(head.jsonLd).toMatchObject({ "@type": "LearningResource", name: lesson.title });
      titles.add(head.title);
    }
    expect(titles.size).toBe(LESSONS.length);
    expect(headFor("/cours").indexable).toBe(true);
    expect(headFor("/cours/inexistant").indexable).toBe(false);
  });

  it("mettent en gras ce qui est entre astérisques", () => {
    expect(paragraphs("Un **ton** vaut\n\ndeux demi-tons.")).toEqual([
      [{ text: "Un ", strong: false }, { text: "ton", strong: true }, { text: " vaut", strong: false }],
      [{ text: "deux demi-tons.", strong: false }],
    ]);
  });
});
