import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignIn } from "./SignIn";

describe("formulaire de connexion", () => {
  it("propose l'adresse et le mot de passe d'emblée", () => {
    const html = renderToString(<SignIn intro="Test" />);
    expect(html).toContain("Se connecter");
    expect(html).toContain("Créer un compte");
  });

  it("n'affiche Google qu'une fois son activation vérifiée", () => {
    // Au premier affichage, l'activation de Google n'est pas encore connue :
    // pas de bouton qui mènerait à une erreur de Supabase.
    expect(renderToString(<SignIn intro="Test" />)).not.toContain("Continuer avec Google");
  });
});
