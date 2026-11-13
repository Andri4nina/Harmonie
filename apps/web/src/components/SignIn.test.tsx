import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignIn } from "./SignIn";

describe("formulaire de connexion", () => {
  it("propose Google, puis l'adresse et le mot de passe", () => {
    const html = renderToString(<SignIn intro="Test" />);
    expect(html).toContain("Continuer avec Google");
    expect(html).toContain("Se connecter");
    expect(html).toContain("Créer un compte");
    expect(html.indexOf("Continuer avec Google")).toBeLessThan(html.indexOf("Se connecter"));
  });
});
