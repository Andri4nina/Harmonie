import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { ACCOUNTS, DEV_SESSION, useAccountState } from "../app/sessionHint";
import { Loader } from "./Loader";

/**
 * Les outils (tableau de bord, oreille, Composer, analyse, réglages) passent
 * par la connexion. La session est lue sur l'appareil : une fois connecté,
 * on entre même hors connexion. Sans comptes configurés, rien n'est bloqué.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { checked, account } = useAccountState();
  const { pathname, search } = useLocation();
  if (!ACCOUNTS || DEV_SESSION) return <>{children}</>;
  if (!checked) return <Loader label="Lecture de la session" />;
  if (!account) return <Navigate to={`/connexion?suite=${encodeURIComponent(pathname + search)}`} replace />;
  return <>{children}</>;
}
