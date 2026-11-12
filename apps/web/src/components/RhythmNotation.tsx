/**
 * Notation d'une mesure de rythme à 4/4, à partir des cellules du moteur
 * (`q h qr ee qde ere ssss trip`). Chaque temps occupe la même largeur, pour
 * que la pulsation se lise.
 */

const BEAT = 46;
const LEFT = 10;
const LINE_Y = 40;
const STEM_TOP = 12;

interface Sound {
  /** Position en temps depuis le début de la mesure. */
  at: number;
  rest: boolean;
  /** 4 = noire, 2 = blanche, 8 = croche, 16 = double croche. */
  value: 2 | 4 | 8 | 16;
  dotted?: boolean;
}

interface Group {
  sounds: Sound[];
  /** Ligature : 1 (croches), 2 (doubles croches) ; 0 si notes isolées. */
  beams: 0 | 1 | 2;
  tuplet?: number;
}

/** Ce que contient chaque cellule (même définition que le moteur). */
function cell(id: string, at: number): { beats: number; groups: Group[] } {
  switch (id) {
    case "q":
      return { beats: 1, groups: [{ sounds: [{ at, rest: false, value: 4 }], beams: 0 }] };
    case "qr":
      return { beats: 1, groups: [{ sounds: [{ at, rest: true, value: 4 }], beams: 0 }] };
    case "h":
      return { beats: 2, groups: [{ sounds: [{ at, rest: false, value: 2 }], beams: 0 }] };
    case "ee":
      return { beats: 1, groups: [{ sounds: [0, 0.5].map((o) => ({ at: at + o, rest: false, value: 8 as const })), beams: 1 }] };
    case "qde":
      return {
        beats: 2,
        groups: [
          { sounds: [{ at, rest: false, value: 4, dotted: true }], beams: 0 },
          { sounds: [{ at: at + 1.5, rest: false, value: 8 }], beams: 0 },
        ],
      };
    case "ere":
      return {
        beats: 1,
        groups: [
          { sounds: [{ at, rest: true, value: 8 }], beams: 0 },
          { sounds: [{ at: at + 0.5, rest: false, value: 8 }], beams: 0 },
        ],
      };
    case "ssss":
      return { beats: 1, groups: [{ sounds: [0, 0.25, 0.5, 0.75].map((o) => ({ at: at + o, rest: false, value: 16 as const })), beams: 2 }] };
    case "trip":
      return { beats: 1, groups: [{ sounds: [0, 1 / 3, 2 / 3].map((o) => ({ at: at + o, rest: false, value: 8 as const })), beams: 1, tuplet: 3 }] };
    default:
      return { beats: 1, groups: [] };
  }
}

const x = (at: number) => LEFT + at * BEAT + 8;

function Head({ sound }: { sound: Sound }) {
  const cx = x(sound.at);
  return (
    <>
      <ellipse
        cx={cx}
        cy={LINE_Y}
        rx={5.6}
        ry={4.2}
        transform={`rotate(-20 ${cx} ${LINE_Y})`}
        fill={sound.value === 2 ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={sound.value === 2 ? 1.6 : 0}
      />
      {sound.dotted && <circle cx={cx + 10} cy={LINE_Y - 2} r={1.8} fill="currentColor" />}
    </>
  );
}

function Rest({ sound }: { sound: Sound }) {
  const cx = x(sound.at);
  if (sound.value === 4) {
    // Soupir.
    return (
      <path
        d={`M${cx - 2} ${LINE_Y - 16} l5 6 l-5 5 l5 6 c-4 -2 -7 1 -3 5`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  // Demi-soupir.
  return (
    <g fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx={cx - 2} cy={LINE_Y - 8} r={2.4} stroke="none" />
      <path d={`M${cx - 2} ${LINE_Y - 6} q4 1 6 -3 l-5 14`} fill="none" />
    </g>
  );
}

function GroupView({ group }: { group: Group }) {
  const notes = group.sounds.filter((s) => !s.rest);
  const stemX = (s: Sound) => x(s.at) + 5;
  const first = notes[0];
  const last = notes[notes.length - 1];
  return (
    <g>
      {group.sounds.map((sound) => (sound.rest ? <Rest key={sound.at} sound={sound} /> : <Head key={sound.at} sound={sound} />))}
      {notes.map((sound) => (
        <line key={`s${sound.at}`} x1={stemX(sound)} y1={LINE_Y - 1} x2={stemX(sound)} y2={STEM_TOP} stroke="currentColor" strokeWidth={1.5} />
      ))}
      {group.beams === 0 &&
        notes
          .filter((s) => s.value >= 8)
          .map((sound) => (
            // Crochet d'une croche isolée.
            <path
              key={`f${sound.at}`}
              d={`M${stemX(sound)} ${STEM_TOP} c1 6 9 7 7 16`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ))}
      {group.beams > 0 && first && last && (
        <>
          <line x1={stemX(first)} y1={STEM_TOP + 1} x2={stemX(last)} y2={STEM_TOP + 1} stroke="currentColor" strokeWidth={4} />
          {group.beams === 2 && <line x1={stemX(first)} y1={STEM_TOP + 7} x2={stemX(last)} y2={STEM_TOP + 7} stroke="currentColor" strokeWidth={4} />}
        </>
      )}
      {group.tuplet && first && last && (
        <text x={(stemX(first) + stemX(last)) / 2} y={STEM_TOP - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="currentColor" fontFamily="var(--font-sans)">
          {group.tuplet}
        </text>
      )}
    </g>
  );
}

export function RhythmNotation({ pattern, label }: { pattern: string; label?: string }) {
  let at = 0;
  const groups: Group[] = [];
  for (const id of pattern.split(" ")) {
    const { beats, groups: parts } = cell(id, at);
    groups.push(...parts);
    at += beats;
  }
  const width = LEFT * 2 + 4 * BEAT;
  return (
    <svg viewBox={`0 0 ${width} 54`} className="h-16 w-full max-w-[300px]" role="img" aria-label={label ?? `Rythme ${pattern}`}>
      <line x1={0} y1={LINE_Y} x2={width} y2={LINE_Y} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
      {[1, 2, 3].map((beat) => (
        <line key={beat} x1={LEFT + beat * BEAT} y1={LINE_Y + 6} x2={LEFT + beat * BEAT} y2={LINE_Y + 10} stroke="currentColor" strokeOpacity={0.3} />
      ))}
      {groups.map((group, index) => (
        <GroupView key={index} group={group} />
      ))}
    </svg>
  );
}
