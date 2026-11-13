import { describe, expect, it } from "vitest";
import { initials, storedAccount } from "./sessionHint";

describe("session enregistrée", () => {
  it("lit l'adresse, le nom et la photo d'une session gardée", () => {
    const raw = JSON.stringify({
      refresh_token: "r",
      user: { email: "a@b.c", user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://lh3.googleusercontent.com/x" } },
    });
    expect(storedAccount(raw)).toEqual({ email: "a@b.c", name: "Ada Lovelace", avatar: "https://lh3.googleusercontent.com/x" });
  });

  it("ignore l'absence, une session sans jeton de renouvellement, un texte abîmé et une photo non https", () => {
    expect(storedAccount(null)).toBeNull();
    expect(storedAccount(JSON.stringify({ user: { email: "a@b.c" } }))).toBeNull();
    expect(storedAccount("{")).toBeNull();
    const raw = JSON.stringify({ refresh_token: "r", user: { email: "a@b.c", user_metadata: { picture: "javascript:alert(1)" } } });
    expect(storedAccount(raw)?.avatar).toBeNull();
  });

  it("forme des initiales lisibles", () => {
    expect(initials({ email: "x@y.z", name: "Ada Lovelace", avatar: null })).toBe("AL");
    expect(initials({ email: "jean.dupont@y.z", name: null, avatar: null })).toBe("JD");
    expect(initials({ email: "solo@y.z", name: null, avatar: null })).toBe("S");
  });
});
