import { lazy, Suspense, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { Loader, TopProgress } from "./components/Loader";
import { Sidebar } from "./components/Sidebar";
import { TopoBackground } from "./components/TopoBackground";
import { Dashboard } from "./pages/Dashboard";
import { Downloads } from "./pages/Downloads";
import { Explorer } from "./pages/Explorer";
import { Settings } from "./pages/Settings";
import { useSettings } from "./state/store";
import { nodeView } from "./theory/engine";
import { applyHead, headFor } from "./theory/head";
import { hueOf } from "./theory/labels";
import { idOf, pathOf } from "./theory/routes";

// Pages d'application, chargées à la demande : le client Supabase et la frise
// n'alourdissent pas les pages publiques.
const Analyzer = lazy(() => import("./pages/Analyzer").then((module) => ({ default: module.Analyzer })));
const Library = lazy(() => import("./pages/Analyzer").then((module) => ({ default: module.Library })));
const TrackPage = lazy(() => import("./pages/TrackPage").then((module) => ({ default: module.TrackPage })));

function OnDemand({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loader label="Chargement de la page" />}>{children}</Suspense>;
}

/** Teinte d'une page : celle de l'élément exploré, sinon le vert de la marque. */
export function hueForPath(pathname: string): number {
  const id = idOf(pathname);
  return hueOf((id ? nodeView(id)?.pitchClass : undefined) ?? 0);
}

export function App() {
  const { pathname } = useLocation();
  const hue = hueForPath(pathname);
  const lite = useSettings((state) => state.lite);

  // Les réglages enregistrés ne sont relus qu'après l'hydratation.
  useEffect(() => {
    void Promise.resolve(useSettings.persist.rehydrate()).then(() => useSettings.setState({ ready: true }));
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--h", String(hue));
  }, [hue]);
  useEffect(() => {
    document.documentElement.dataset.lite = String(lite);
  }, [lite]);
  useEffect(() => {
    applyHead(headFor(pathname));
  }, [pathname]);

  return (
    <>
      <TopProgress />
      <TopoBackground />
      <div className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:gap-6">
        <Sidebar />
        <main id="contenu" className="min-w-0 flex-1 pb-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explorer" element={<Navigate to={pathOf("note:C")} replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/telecharger" element={<Downloads />} />
            <Route path="/analyser" element={<OnDemand><Analyzer /></OnDemand>} />
            <Route path="/analyser/:id" element={<OnDemand><TrackPage /></OnDemand>} />
            <Route path="/bibliotheque" element={<OnDemand><Library /></OnDemand>} />
            <Route path="*" element={<Explorer />} />
          </Routes>
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[0.8125rem] text-ivory-3">
            <span>
              Harmonie, conçu et développé par <span className="text-ivory-2">Andrianina Rasoamanana</span>
            </span>
            <Link to="/telecharger" className="underline-offset-4 hover:text-ivory-2 hover:underline">
              Télécharger l'application
            </Link>
          </footer>
        </main>
      </div>
    </>
  );
}
