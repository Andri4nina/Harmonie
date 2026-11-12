import { useNavigate } from "react-router";
import { circleOfFifths } from "../theory/engine";
import { hueOf } from "../theory/labels";
import { pathOf } from "../theory/routes";

const CENTER = 190;
const RINGS = { outer: [112, 156], inner: [70, 110] } as const;

function arc(inner: number, outer: number, index: number): string {
  const from = ((index * 30 - 105) * Math.PI) / 180;
  const to = ((index * 30 - 75) * Math.PI) / 180;
  const point = (radius: number, angle: number) =>
    `${(CENTER + radius * Math.cos(angle)).toFixed(2)} ${(CENTER + radius * Math.sin(angle)).toFixed(2)}`;
  return `M${point(outer, from)} A${outer} ${outer} 0 0 1 ${point(outer, to)} L${point(inner, to)} A${inner} ${inner} 0 0 0 ${point(inner, from)}Z`;
}

function position(radius: number, index: number): [number, number] {
  const angle = ((index * 30 - 90) * Math.PI) / 180;
  const round = (value: number) => Math.round(value * 100) / 100;
  return [round(CENTER + radius * Math.cos(angle)), round(CENTER + radius * Math.sin(angle))];
}

function signatureLabel(signature: number): string {
  if (signature === 0) return "0";
  return signature > 0 ? `${signature}♯` : `${-signature}♭`;
}

/**
 * Cercle des quintes. `current` et `related` sont des clés
 * « classe de hauteur:mode » (ex. "9:minor") pour ignorer l'enharmonie.
 */
export function CircleOfFifths({ current, related }: { current?: string; related?: Set<string> }) {
  const navigate = useNavigate();
  const sectors = circleOfFifths();

  const sector = (id: string, label: string, key: string, ring: readonly [number, number], index: number) => {
    const hue = hueOf(Number(key.split(":")[0]));
    const isCurrent = current === key;
    const isRelated = related?.has(key) ?? false;
    const [x, y] = position((ring[0] + ring[1]) / 2, index);
    return (
      <g
        key={id}
        role="link"
        tabIndex={0}
        aria-label={`Tonalité ${label}`}
        onClick={() => navigate(pathOf(id))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") navigate(pathOf(id));
        }}
        className="group cursor-pointer outline-none"
      >
        <path
          d={arc(ring[0], ring[1], index)}
          fill={`oklch(0.84 0.09 ${hue} / ${isCurrent ? 0.9 : isRelated ? 0.3 : 0.06})`}
          stroke={`oklch(0.84 0.09 ${hue} / ${isCurrent || isRelated ? 0.9 : 0.25})`}
          strokeWidth={1}
          strokeDasharray={isCurrent || isRelated ? undefined : "3 4"}
          className="transition-[fill] duration-200 group-hover:fill-white/20 group-focus-visible:fill-white/20"
        />
        <text
          x={x}
          y={y + 4}
          textAnchor="middle"
          fontSize={ring === RINGS.outer ? 14 : 11}
          fontWeight={600}
          fontFamily="var(--font-display)"
          fill={isCurrent ? "#161a2e" : "#e8eef5"}
          pointerEvents="none"
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 380 380" className="mx-auto w-full max-w-[380px]" aria-label="Cercle des quintes">
      {sectors.map((item, index) => {
        const [x, y] = position(172, index);
        return (
          <g key={item.majorId}>
            {sector(item.majorId, item.major, `${item.pitchClass}:major`, RINGS.outer, index)}
            {sector(item.minorId, item.minor, `${(item.pitchClass + 9) % 12}:minor`, RINGS.inner, index)}
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize={9.5}
              fontFamily="var(--font-sans)"
              fill="rgb(236 230 216 / 0.45)"
            >
              {signatureLabel(item.signature)}
            </text>
          </g>
        );
      })}
      <text x={CENTER} y={CENTER - 2} textAnchor="middle" fontSize={13} fontStyle="italic" fontFamily="var(--font-display)" fill="rgb(236 230 216 / 0.55)">
        Cercle
      </text>
      <text x={CENTER} y={CENTER + 13} textAnchor="middle" fontSize={13} fontStyle="italic" fontFamily="var(--font-display)" fill="rgb(236 230 216 / 0.55)">
        des quintes
      </text>
    </svg>
  );
}
