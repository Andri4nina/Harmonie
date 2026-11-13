import { type ThemeChoice, useSettings } from "../state/store";
import { Icon } from "./ui";

const CHOICES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "system", label: "Système", icon: "system" },
  { value: "light", label: "Clair", icon: "sun" },
  { value: "dark", label: "Sombre", icon: "moon" },
];

/** Choix du thème. `compact` : icônes seules, pour la barre latérale. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  return (
    <div role="radiogroup" aria-label="Thème" className={`${compact ? "inline-flex" : "flex w-full"} gap-1 rounded-full border border-line p-1`}>
      {CHOICES.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={theme === choice.value}
          title={choice.label}
          onClick={() => setTheme(choice.value)}
          className={`flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors duration-150 ${compact ? "" : "flex-1"} ${
            theme === choice.value ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:text-ivory"
          }`}
        >
          <Icon name={choice.icon} className="size-4 shrink-0" />
          <span className={compact ? "sr-only" : ""}>{choice.label}</span>
        </button>
      ))}
    </div>
  );
}
