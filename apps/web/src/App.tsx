import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Sidebar } from "./components/Sidebar";
import { TopoBackground } from "./components/TopoBackground";
import { Dashboard } from "./pages/Dashboard";
import { Explorer } from "./pages/Explorer";
import { Settings } from "./pages/Settings";
import { useSettings } from "./state/store";
import { nodeView } from "./theory/engine";
import { explorerPath, hueOf } from "./theory/labels";

const EXPLORER_PREFIX = "/explorer/";

/** Teinte de la page : celle de l'élément exploré, sinon le vert de la marque. */
function usePageHue(): number {
  const { pathname } = useLocation();
  if (!pathname.startsWith(EXPLORER_PREFIX)) return hueOf(0);
  let id = pathname.slice(EXPLORER_PREFIX.length);
  try {
    id = decodeURIComponent(id);
  } catch {
    // Adresse mal encodée : on garde la teinte par défaut.
  }
  return hueOf(nodeView(id)?.pitchClass ?? 0);
}

export function App() {
  const hue = usePageHue();
  const lite = useSettings((state) => state.lite);

  useEffect(() => {
    document.documentElement.style.setProperty("--h", String(hue));
  }, [hue]);
  useEffect(() => {
    document.documentElement.dataset.lite = String(lite);
  }, [lite]);

  return (
    <>
      <TopoBackground hue={hue} />
      <div className="mx-auto flex min-h-full max-w-[1500px] gap-4 p-4">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explorer" element={<Navigate to={explorerPath("note:C")} replace />} />
            <Route path="/explorer/*" element={<Explorer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
