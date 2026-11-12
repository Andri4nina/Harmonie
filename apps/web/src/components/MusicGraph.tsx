import { useNavigate } from "react-router";
import type { NodeView } from "../theory/engine";
import { GROUP_LABEL, detailLabel, hueOf, labelOf, shortLabelOf } from "../theory/labels";
import { pathOf } from "../theory/routes";

const SIZE = 560;
const CENTER = SIZE / 2;

// Arrondi commun au pré-rendu et au navigateur : le HTML doit être identique.
const round = (value: number) => Math.round(value * 100) / 100;

interface Placed {
  key: string;
  id: string;
  group: string;
  detail: string | null;
  pitchClass: number;
  x: number;
  y: number;
  angle: number;
}

/** Répartit les relations autour du centre, rubrique par rubrique. */
function layout(view: NodeView): { nodes: Placed[]; sectors: { key: string; angle: number }[] } {
  const total = view.groups.reduce((sum, group) => sum + group.items.length, 0);
  const slots = total + view.groups.length;
  const twoRings = total > 26;
  const nodes: Placed[] = [];
  const sectors: { key: string; angle: number }[] = [];
  let slot = 0;
  for (const group of view.groups) {
    const first = slot;
    group.items.forEach((item, index) => {
      const angle = (slot / slots) * Math.PI * 2 - Math.PI / 2;
      const radius = twoRings ? (index % 2 === 0 ? 148 : 204) : 176;
      nodes.push({
        key: `${group.key}|${item.id}`,
        id: item.id,
        group: group.key,
        detail: item.detail,
        pitchClass: item.pitchClass,
        x: round(CENTER + radius * Math.cos(angle)),
        y: round(CENTER + radius * Math.sin(angle)),
        angle,
      });
      slot++;
    });
    sectors.push({ key: group.key, angle: ((first + slot - 1) / 2 / slots) * Math.PI * 2 - Math.PI / 2 });
    slot++;
  }
  return { nodes, sectors };
}

/**
 * Graphe musical : le nœud exploré au centre, ses relations autour. Un clic
 * sur un nœud en fait le nouveau centre. Les nœuds gardent leur identité
 * d'une vue à l'autre et glissent vers leur nouvelle place.
 */
export function MusicGraph({ view }: { view: NodeView }) {
  const navigate = useNavigate();
  const { nodes, sectors } = layout(view);
  const centerHue = hueOf(view.pitchClass);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[560px] text-ivory" aria-label="Graphe des relations">
      {[148, 204, 252].map((radius) => (
        <circle
          key={radius}
          cx={CENTER}
          cy={CENTER}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.05)"
          strokeDasharray="2 6"
        />
      ))}
      {nodes.map((node) => (
        <line
          key={node.key}
          x1={CENTER}
          y1={CENTER}
          x2={node.x}
          y2={node.y}
          stroke="currentColor"
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}
      {sectors.map((sector) => {
        // Texte tangent au cercle, retourné dans la moitié basse pour rester lisible.
        const below = Math.sin(sector.angle) > 0;
        const degrees = round((sector.angle * 180) / Math.PI + (below ? -90 : 90));
        const radius = below ? 268 : 262;
        const x = round(CENTER + radius * Math.cos(sector.angle));
        const y = round(CENTER + radius * Math.sin(sector.angle));
        return (
          <text
            key={sector.key}
            x={x}
            y={y}
            transform={`rotate(${degrees} ${x} ${y})`}
            textAnchor="middle"
            fontSize={13}
            fontFamily="var(--font-sans)"
            fill="currentColor" fillOpacity={0.42}
          >
            {GROUP_LABEL[sector.key] ?? sector.key}
          </text>
        );
      })}
      {nodes.map((node) => {
        const hue = hueOf(node.pitchClass);
        const detail = detailLabel(node.group, node.detail);
        const label = shortLabelOf(node.id);
        const width = Math.max(36, label.length * 9 + 18);
        return (
          <g
            key={node.key}
            role="link"
            tabIndex={0}
            aria-label={`${label} : ${labelOf(node.id)}${detail ? `, ${detail}` : ""}`}
            onClick={() => navigate(pathOf(node.id))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") navigate(pathOf(node.id));
            }}
            className="group cursor-pointer outline-none"
            style={{
              transform: `translate(${node.x}px, ${node.y}px)`,
              transition: "transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            <title>{`${labelOf(node.id)}${detail ? ` — ${detail}` : ""}`}</title>
            <rect
              x={-width / 2}
              y={-12}
              width={width}
              height={24}
              rx={12}
              fill={`oklch(0.3 0.06 ${hue} / 0.85)`}
              stroke={`oklch(0.84 0.09 ${hue} / 0.6)`}
              strokeWidth={1}
              className="transition-[fill] duration-150 group-hover:fill-white/25 group-focus-visible:fill-white/25"
            />
            <text
              y={4.5}
              textAnchor="middle"
              fontSize={11.5}
              fontWeight={500}
              fontFamily="var(--font-display)"
              fill={`oklch(0.93 0.09 ${hue})`}
              pointerEvents="none"
            >
              {label}
            </text>
          </g>
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={46} fill={`oklch(0.84 0.09 ${centerHue} / 0.16)`} />
      <circle cx={CENTER} cy={CENTER} r={46} fill="none" stroke={`oklch(0.84 0.09 ${centerHue})`} strokeWidth={1.5} />
      <text
        x={CENTER}
        y={CENTER + 5}
        textAnchor="middle"
        fontSize={shortLabelOf(view.id).length > 7 ? 9 : 13}
        fontWeight={700}
        fontFamily="var(--font-display)"
        fill="currentColor"
      >
        {shortLabelOf(view.id)}
      </text>
    </svg>
  );
}
