import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nodeView, resolveQuery } from "../theory/engine";
import { KIND_LABEL, explorerPath, labelOf } from "../theory/labels";
import { Icon, hueStyle } from "./ui";

/** Recherche libre : le moteur interprète la saisie (note, accord, tonalité, gamme). */
export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const results = useMemo(() => {
    if (!text.trim()) return [];
    return resolveQuery(text).flatMap((id) => {
      const view = nodeView(id);
      return view ? [view] : [];
    });
  }, [text]);

  const go = (id: string) => {
    setText("");
    setOpen(false);
    navigate(explorerPath(id));
  };

  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        const first = results[0];
        if (first) go(first.id);
      }}
    >
      <label className="glass flex items-center gap-3 !rounded-2xl px-4 py-3 text-fg-2 focus-within:text-fg">
        <Icon name="search" className="size-4 shrink-0" />
        <span className="sr-only">Chercher une note, un accord, une gamme ou une tonalité</span>
        <input
          value={text}
          autoFocus={autoFocus}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="C#, Am7, F# minor, D dorian…"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-fg-3"
        />
      </label>

      {open && text.trim() !== "" && (
        <div className="glass glass-raised enter absolute top-full right-0 left-0 z-20 mt-2 !rounded-2xl p-2">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-3">
              Le moteur ne reconnaît pas « {text.trim()} ». Essayez une note (Bb), un accord (Dm7), une tonalité (E
              minor) ou une gamme (G mixolydian).
            </p>
          ) : (
            results.map((view) => (
              <button
                key={view.id}
                type="button"
                data-hue
                style={hueStyle(view.pitchClass)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(view.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]"
              >
                <span className="size-2 rounded-full bg-[var(--accent)]" />
                <span className="font-mono">{labelOf(view.id)}</span>
                <span className="eyebrow ml-auto">{KIND_LABEL[view.kind]}</span>
              </button>
            ))
          )}
        </div>
      )}
    </form>
  );
}
