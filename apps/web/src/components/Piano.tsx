import { useEffect, useRef } from "react";
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
  const scroller = useRef<HTMLDivElement>(null);
  // Sur un écran étroit, le clavier défile : il s'ouvre centré sur le do central.
  useEffect(() => {
    const element = scroller.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    const middleC = KEYS.find((key) => key.midi === 60)?.x ?? 0;
    element.scrollLeft = (middleC / WIDTH) * element.scrollWidth - element.clientWidth / 2;
  }, []);
  const byClass = new Map(tones.map((tone) => [tone.pitchClass, tone]));
  const exact = new Set([...tones.map((tone) => tone.midi), ...played]);

  const render = (key: Key) => {
    const tone = byClass.get(key.midi % 12);
    const sounding = active.includes(key.midi);
    const isExact = tone !== undefined && exact.has(key.midi);
    const hue = hueOf(key.midi % 12);
    let fill = key.black ? "#11142a" : "rgb(236 230 216 / 0.9)";
    if (isExact) fill = `oklch(${key.black ? 0.66 : 0.84} 0.09 ${hue})`;
    if (sounding) fill = `oklch(0.93 0.09 ${hue})`;
    const width = key.black ? BLACK_WIDTH : WHITE_WIDTH;
    const keyHeight = key.black ? BLACK_HEIGHT : WHITE_HEIGHT;
    return (
      <g key={key.midi} onClick={() => playNote(key.midi)} className="cursor-pointer">
        {tone && <title>{`${tone.note} — ${tone.role}`}</title>}
        <rect
          x={key.x + 0.75}
          y={0}
          width={width - 1.5}
          height={keyHeight}
          rx={key.black ? 2.5 : 4}
          fill={fill}
          stroke="rgb(22 26 46 / 0.9)"
          strokeWidth={key.black ? 1 : 0.5}
          style={{
            transition: "fill 120ms ease-out",
            filter: sounding ? `drop-shadow(0 0 5px oklch(0.9 0.09 ${hue}))` : undefined,
          }}
        />
        {tone && !isExact && !sounding && (
          // Même note à une autre octave : un simple repère au pied de la touche.
          <rect
            x={key.x + (key.black ? 3 : 5)}
            y={keyHeight - 7}
            width={width - (key.black ? 6 : 10)}
            height={3}
            rx={1.5}
            fill={`oklch(0.8 0.09 ${hue} / 0.75)`}
            pointerEvents="none"
          />
        )}
        {isExact && tone && (
          <text
            x={key.x + width / 2}
            y={keyHeight - 9}
            textAnchor="middle"
            fontSize={key.black ? 7.5 : 9}
            fontFamily="var(--font-sans)"
            fontWeight={600}
            fill={key.black ? "#fff" : "#161a2e"}
            pointerEvents="none"
          >
            {tone.note}
          </text>
        )}
      </g>
    );
  };

  return (
    <div ref={scroller} className="scroll-x -mx-1 px-1 pb-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${WHITE_HEIGHT + 4}`}
        className="w-full min-w-[620px] touch-manipulation select-none"
        role="img"
        aria-label={`Clavier : ${tones.map((tone) => tone.note).join(", ")}`}
      >
        {KEYS.filter((key) => !key.black).map(render)}
        {KEYS.filter((key) => key.black).map(render)}
      </svg>
    </div>
  );
}
