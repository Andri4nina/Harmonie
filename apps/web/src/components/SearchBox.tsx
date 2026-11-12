import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { nodeView, resolveQuery } from "../theory/engine";
import { KIND_LABEL, labelOf } from "../theory/labels";
import { Icon, hueStyle } from "./ui";
import { pathOf } from "../theory/routes";

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
    navigate(pathOf(id));
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
      <label className="glass flex min-h-12 items-center gap-3 !rounded-full px-5 text-ivory-2 focus-within:border-[var(--accent-line)] focus-within:text-ivory">
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
          placeholder="Une note, un accord, une gamme : C#, Am7, D dorian"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent text-base outline-none placeholder:text-ivory-3"
        />
      </label>

      {open && text.trim() !== "" && (
        <div className="glass glass-raised absolute top-full right-0 left-0 z-20 mt-2 p-2">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ivory-2">
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
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--note-soft)]"
              >
                <span className="size-2 shrink-0 rounded-full bg-[var(--note)]" />
                <span className="font-display text-[1.05rem] font-semibold">{labelOf(view.id)}</span>
                <span className="caption ml-auto">{KIND_LABEL[view.kind]}</span>
              </button>
            ))
          )}
        </div>
      )}
    </form>
  );
}
