import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SignIn } from "./SignIn";

describe("formulaire de connexion", () => {
  it("propose l'adresse et le mot de passe d'emblée", () => {
    const html = renderToString(<MemoryRouter><SignIn intro="Test" /></MemoryRouter>);
    expect(html).toContain("Se connecter");
    expect(html).toContain("Créer un compte");
    expect(html).toContain("conditions d&#x27;utilisation");
  });

  it("n'affiche Google qu'une fois son activation vérifiée", () => {
    // Au premier affichage, l'activation de Google n'est pas encore connue :
    // pas de bouton qui mènerait à une erreur de Supabase.
    expect(renderToString(<MemoryRouter><SignIn intro="Test" /></MemoryRouter>)).not.toContain("Continuer avec Google");
  });
});
