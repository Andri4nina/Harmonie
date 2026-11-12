import { useMemo } from "react";
import { playNote } from "../audio/synth";
import { usePlayer } from "../state/store";
import { type InstrumentView, type Tone, fretboard } from "../theory/engine";
import { hueOf } from "../theory/labels";

const MAX_STOPS = 15;
const WIDTH = 780;
const NUT = 52;
const STRING_GAP = 27;
const TOP = 22;
const INLAYS = [3, 5, 7, 9, 12, 15];

/**
 * Manche d'un instrument à cordes. Les positions viennent du moteur ; ce
 * composant ne fait que les placer. Un clic joue la note.
 */
export function Fretboard({ instrument, tones }: { instrument: InstrumentView; tones: Tone[] }) {
  const active = usePlayer((state) => state.active);
  const stops = Math.min(instrument.span, MAX_STOPS);
  const marks = useMemo(
    () =>
      fretboard(
        instrument.id,
        tones.map((tone) => tone.note),
      ).filter((mark) => mark.stop <= stops),
    [instrument.id, tones, stops],
  );
  const rootClass = tones[0]?.pitchClass;
  const stringCount = instrument.strings.length;
  const height = TOP * 2 + (stringCount - 1) * STRING_GAP + 14;
  const stopWidth = (WIDTH - NUT - 12) / stops;
  const xOf = (stop: number) => (stop === 0 ? NUT - 13 :NUT + (stop - 0.5) * stopWidth);
  const yOf = (string: number) => TOP + (stringCount - 1 - string) * STRING_GAP;
  const bottom = yOf(0);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full min-w-[640px] select-none"
        role="img"
        aria-label={`${instrument.name} : positions de ${tones.map((tone) => tone.note).join(", ")}`}
      >
        <rect
          x={NUT}
          y={TOP - 10}
          width={WIDTH - NUT - 12}
          height={bottom - TOP + 20}
          rx={6}
          fill="rgb(255 255 255 / 0.025)"
        />
        {INLAYS.filter((stop) => stop <= stops).map((stop) => (
          <circle
            key={stop}
            cx={xOf(stop)}
            cy={(TOP + bottom) / 2}
            r={stop === 12 ? 5 : 3.5}
            fill="rgb(255 255 255 / 0.07)"
          />
        ))}
        {/* Sillet, puis frettes (ou repères en pointillés sur une touche lisse). */}
        <line x1={NUT} y1={TOP - 10} x2={NUT} y2={bottom + 10} stroke="rgb(232 238 245 / 0.7)" strokeWidth={3} />
        {Array.from({ length: stops }, (_, index) => index + 1).map((stop) => (
          <g key={stop}>
            <line
              x1={NUT + stop * stopWidth}
              y1={TOP - 10}
              x2={NUT + stop * stopWidth}
              y2={bottom + 10}
              stroke="rgb(255 255 255 / 0.16)"
              strokeWidth={1}
              strokeDasharray={instrument.fretted ? undefined : "2 5"}
            />
            <text
              x={xOf(stop)}
              y={height - 3}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="rgb(232 238 245 / 0.35)"
            >
              {stop}
            </text>
          </g>
        ))}
        {instrument.strings.map((string, index) => (
          <g key={index}>
            <line
              x1={NUT}
              y1={yOf(index)}
              x2={WIDTH - 12}
              y2={yOf(index)}
              stroke="rgb(232 238 245 / 0.34)"
              strokeWidth={1 + (stringCount - 1 - index) * 0.28}
            />
            <text
              x={2}
              y={yOf(index) + 3}
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="rgb(232 238 245 / 0.4)"
            >
              {string.open}
            </text>
          </g>
        ))}
        {marks.map((mark) => {
          const hue = hueOf(mark.pitchClass);
          const sounding = active.includes(mark.midi);
          const isRoot = mark.pitchClass === rootClass;
          return (
            <g
              key={`${mark.string}-${mark.stop}`}
              onPointerDown={() => playNote(mark.midi)}
              className="cursor-pointer"
              style={{ filter: sounding ? `drop-shadow(0 0 7px oklch(0.9 0.17 ${hue}))` : undefined }}
            >
              <title>{`${mark.note} — corde ${mark.string + 1}, case ${mark.stop}`}</title>
              <circle
                cx={xOf(mark.stop)}
                cy={yOf(mark.string)}
                r={sounding ? 11 : 9.5}
                fill={`oklch(${sounding ? 0.93 : 0.82} 0.15 ${hue} / ${isRoot || sounding ? 1 : 0.22})`}
                stroke={`oklch(0.84 0.14 ${hue})`}
                strokeWidth={1.4}
                style={{ transition: "r 120ms ease-out, fill 120ms ease-out" }}
              />
              <text
                x={xOf(mark.stop)}
                y={yOf(mark.string) + 3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fontFamily="var(--font-mono)"
                fill={isRoot || sounding ? "#070b12" : "#e8eef5"}
                pointerEvents="none"
              >
                {mark.note}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
