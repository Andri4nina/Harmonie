import { describe, expect, it } from "vitest";
import { hueOf } from "./labels";

describe("teintes des notes", () => {
  it("sont toutes différentes et jamais vertes", () => {
    const hues = Array.from({ length: 12 }, (_, pc) => hueOf(pc));
    expect(new Set(hues).size).toBe(12);
    for (const hue of hues) expect(hue < 95 || hue > 175, `teinte ${hue}`).toBe(true);
  });
});
