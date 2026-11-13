import { describe, expect, it } from "vitest";
import { pluckSamples } from "./voices";

/** Période fondamentale par autocorrélation, interpolée. */
function period(samples: Float32Array, from: number, to: number): number {
  const start = 4000;
  const size = 4096;
  let best = from;
  let bestValue = -Infinity;
  const score = (lag: number) => {
    let sum = 0;
    for (let i = start; i < start + size; i++) sum += (samples[i] ?? 0) * (samples[i + lag] ?? 0);
    return sum;
  };
  for (let lag = from; lag <= to; lag++) {
    const value = score(lag);
    if (value > bestValue) {
      bestValue = value;
      best = lag;
    }
  }
  const [a, b, c] = [score(best - 1), score(best), score(best + 1)];
  return best + (a - c) / (2 * (a - 2 * b + c));
}

describe("corde pincée", () => {
  for (const frequency of [82.41, 220, 659.26]) {
    it(`sonne juste à ${frequency} Hz (moins de 5 cents)`, () => {
      const rate = 48000;
      const samples = pluckSamples(frequency, rate, { t60: 3, brightness: 0.6, position: 0.2, seconds: 1 });
      const expected = rate / frequency;
      const measured = period(samples, Math.floor(expected * 0.9), Math.ceil(expected * 1.1));
      const cents = 1200 * Math.log2(expected / measured);
      expect(Math.abs(cents)).toBeLessThan(5);
    });
  }

  it("s'éteint", () => {
    const samples = pluckSamples(220, 48000, { t60: 1, brightness: 0.6, position: 0.2, seconds: 2 });
    const energy = (from: number) => samples.slice(from, from + 4800).reduce((sum, x) => sum + x * x, 0);
    expect(energy(80000)).toBeLessThan(energy(0) / 100);
  });
});
