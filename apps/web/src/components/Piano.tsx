import { playNote } from "../audio/synth";
import { usePlayer } from "../state/store";
import type { Tone } from "../theory/engine";
import { hueOf } from "../theory/labels";

const LOW = 48; // C3
const HIGH = 95; // B6
const WHITE_WIDTH = 24;
const WHITE_HEIGHT = 118;
const BLACK_WIDTH = 14;
const BLACK_HEIGHT = 72;
const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

interface Key {
  midi: number;
  black: boolean;
  x: number;
}

const KEYS: Key[] = (() => {
  const keys: Key[] = [];
  let whites = 0;
  for (let midi = LOW; midi <= HIGH; midi++) {
    const black = BLACK_CLASSES.has(midi % 12);
    keys.push({ midi, black, x: black ? whites * WHITE_WIDTH - BLACK_WIDTH / 2 : whites * WHITE_WIDTH });
    if (!black) whites++;
  }
  return keys;
})();

const WIDTH = KEYS.filter((key) => !key.black).length * WHITE_WIDTH;

/**
 * Clavier interactif. Les notes de l'élément exploré sont colorées à toutes
 * les octaves ; celles réellement jouées portent leur rôle ; celles qui
 * sonnent s'illuminent. Un clic joue la touche.
 */
export function Piano({ tones, played }: { tones: Tone[]; played: number[] }) {
  const active = usePlayer((state) => state.active);
  const byClass = new Map(tones.map((tone) => [tone.pitchClass, tone]));
  const exact = new Set([...tones.map((tone) => tone.midi), ...played]);

  const render = (key: Key) => {
    const tone = byClass.get(key.midi % 12);
    const sounding = active.includes(key.midi);
    const isExact = tone !== undefined && exact.has(key.midi);
    const hue = hueOf(key.midi % 12);
    let fill = key.black ? "#0b111b" : "rgb(232 238 245 / 0.9)";
    if (tone) fill = `oklch(${key.black ? 0.5 : 0.86} 0.11 ${hue} / ${isExact ? 1 : 0.5})`;
    if (isExact) fill = `oklch(${key.black ? 0.66 : 0.84} 0.15 ${hue})`;
    if (sounding) fill = `oklch(0.93 0.17 ${hue})`;
    const width = key.black ? BLACK_WIDTH : WHITE_WIDTH;
    const keyHeight = key.black ? BLACK_HEIGHT : WHITE_HEIGHT;
    return (
      <g key={key.midi} onPointerDown={() => playNote(key.midi)} className="cursor-pointer">
        <title>{tone ? `${tone.note} — ${tone.role}` : undefined}</title>
        <rect
          x={key.x + 0.75}
          y={0}
          width={width - 1.5}
          height={keyHeight}
          rx={key.black ? 2.5 : 4}
          fill={fill}
          stroke="rgb(7 11 18 / 0.9)"
          strokeWidth={key.black ? 1 : 0.5}
          style={{
            transition: "fill 120ms ease-out",
            filter: sounding ? `drop-shadow(0 0 8px oklch(0.9 0.17 ${hue}))` : undefined,
          }}
        />
        {isExact && tone && (
          <text
            x={key.x + width / 2}
            y={keyHeight - 9}
            textAnchor="middle"
            fontSize={key.black ? 7.5 : 9}
            fontFamily="var(--font-mono)"
            fontWeight={600}
            fill={key.black ? "#fff" : "#070b12"}
            pointerEvents="none"
          >
            {tone.note}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${WHITE_HEIGHT + 4}`}
        className="w-full min-w-[640px] touch-none select-none"
        role="img"
        aria-label={`Clavier : ${tones.map((tone) => tone.note).join(", ")}`}
      >
        {KEYS.filter((key) => !key.black).map(render)}
        {KEYS.filter((key) => key.black).map(render)}
      </svg>
    </div>
  );
}
