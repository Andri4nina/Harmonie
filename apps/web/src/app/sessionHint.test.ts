import { describe, expect, it } from "vitest";
import { storedAccount } from "./sessionHint";

describe("session enregistrée", () => {
  it("lit l'adresse d'une session gardée", () => {
    expect(storedAccount(JSON.stringify({ refresh_token: "r", user: { email: "a@b.c" } }))).toBe("a@b.c");
  });
  it("ignore l'absence, une session sans jeton de renouvellement et un texte abîmé", () => {
    expect(storedAccount(null)).toBeNull();
    expect(storedAccount(JSON.stringify({ user: { email: "a@b.c" } }))).toBeNull();
    expect(storedAccount("{")).toBeNull();
  });
});
