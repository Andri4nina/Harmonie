import { expect, it } from "vitest";
import { APP_VERSION, compareVersions } from "./updates";

it("compare les versions publiées", () => {
  expect(compareVersions("v1.7.0", "1.6.0")).toBeGreaterThan(0);
  expect(compareVersions("1.6.0", "v1.6.0")).toBe(0);
  expect(compareVersions("1.10.0", "1.9.3")).toBeGreaterThan(0);
  expect(compareVersions("2.0.0", "10.0.0")).toBeLessThan(0);
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
