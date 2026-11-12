import { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { TopProgress } from "./components/Loader";
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
      <TopoBackground hue={hue} />
      <div className="mx-auto flex min-h-full max-w-[1500px] gap-4 p-4">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explorer" element={<Navigate to={pathOf("note:C")} replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/telecharger" element={<Downloads />} />
            <Route path="*" element={<Explorer />} />
          </Routes>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-fg-3">
            <span>
              <span className="text-fg-2">Harmonie</span> — conçu et développé par{" "}
              <span className="text-fg-2">Andrianina Rasoamanana</span>
            </span>
            <Link to="/telecharger" className="hover:text-fg-2">
              Télécharger l'application
            </Link>
          </footer>
        </main>
      </div>
    </>
  );
}
