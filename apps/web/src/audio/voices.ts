// Timbres des instruments, synthétisés en Web Audio : aucun échantillon à
// télécharger, tout fonctionne hors ligne.
//
// - cordes pincées (guitare, ukulélé, basse) : algorithme de Karplus-Strong,
//   une corde simulée par une ligne à retard filtrée ;
// - piano : partiels légèrement inharmoniques qui s'éteignent chacun à leur
//   rythme, plus le choc du marteau ;
// - cordes frottées, flûte, saxophone, synthétiseur : oscillateurs filtrés
//   par des formants, avec vibrato ;
// - batterie : chaque pièce General MIDI (36 grosse caisse, 38 caisse
//   claire…) synthétisée à partir de bruit et de sinusoïdes.

export type SoundId =
  | "piano"
  | "guitar"
  | "guitar-drop-d"
  | "ukulele"
  | "bass"
  | "violin"
  | "cello"
  | "flute"
  | "alto-saxophone"
  | "tenor-saxophone"
  | "synthesizer"
  | "drum-kit";

/** Les sons jouables sur un clavier (la batterie se joue au séquenceur). */
export const PITCHED_SOUNDS: SoundId[] = [
  "piano",
  "guitar",
  "ukulele",
  "bass",
  "violin",
  "cello",
  "flute",
  "alto-saxophone",
  "tenor-saxophone",
  "synthesizer",
];

/** Une note qui sonne ; `release` la termine à l'instant donné. */
export interface Voice {
  release(at: number): void;
}

export function isSound(value: string): value is SoundId {
  return value === "drum-kit" || value === "guitar-drop-d" || (PITCHED_SOUNDS as string[]).includes(value);
}

// ------------------------------------------------------------ ressources

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      // Générateur fixe : le même bruit à chaque session.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Enveloppe : montée, maintien, extinction à la relâche. */
function envelope(ctx: BaseAudioContext, start: number, level: number, attack: number, decayTo: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + attack);
  if (decayTo < 1) gain.gain.setTargetAtTime(level * decayTo, start + attack, decay);
  return gain;
}

function releaser(ctx: BaseAudioContext, gain: GainNode, sources: AudioScheduledSourceNode[], time: number): Voice {
  let done = false;
  return {
    release(at: number) {
      if (done) return;
      done = true;
      const when = Math.max(at, ctx.currentTime);
      gain.gain.cancelScheduledValues(when);
      // setTargetAtTime part de la valeur courante, sans saut audible.
      gain.gain.setTargetAtTime(0, when, time / 4);
      for (const source of sources) source.stop(when + time + 0.1);
    },
  };
}

// ------------------------------------------------------------ cordes pincées

interface Pluck {
  /** Durée d'extinction (−60 dB) à 220 Hz, en secondes. */
  t60: number;
  /** Brillance de l'attaque (0 sourde, 1 métallique). */
  brightness: number;
  /** Position du pincement sur la corde (fraction). */
  position: number;
  seconds: number;
}

const PLUCKS: Record<string, Pluck> = {
  guitar: { t60: 3.2, brightness: 0.62, position: 0.18, seconds: 3.5 },
  ukulele: { t60: 1.4, brightness: 0.5, position: 0.22, seconds: 1.8 },
  bass: { t60: 3.8, brightness: 0.35, position: 0.25, seconds: 3.2 },
};

const pluckCache = new Map<string, AudioBuffer>();

/** Corde de Karplus-Strong à retard fractionnaire : la hauteur est juste. */
export function pluckSamples(frequency: number, sampleRate: number, pluck: Pluck): Float32Array {
  const length = Math.floor(sampleRate * pluck.seconds);
  const out = new Float32Array(length);
  const period = sampleRate / frequency;
  // Le filtre moyenneur de la boucle ajoute un demi-échantillon de retard.
  const delay = period - 0.5;
  const whole = Math.floor(delay);
  const fraction = delay - whole;
  const t60 = Math.min(8, pluck.t60 * Math.sqrt(220 / frequency));
  const loss = 10 ** (-3 / (t60 * frequency));

  // Excitation : une période de bruit adouci, creusée à la position du pincement.
  const burst = Math.max(2, Math.round(period));
  const excitation = new Float32Array(burst);
  let seed = Math.round(frequency * 1000) | 1;
  let smooth = 0;
  const alpha = 0.15 + pluck.brightness * 0.8;
  for (let i = 0; i < burst; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    smooth += alpha * ((seed / 0x7fffffff) * 2 - 1 - smooth);
    excitation[i] = smooth;
  }
  const notch = Math.max(1, Math.round(burst * pluck.position));
  for (let i = burst - 1; i >= notch; i--) excitation[i] = (excitation[i] ?? 0) - (excitation[i - notch] ?? 0);

  let previous = 0;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const a = n - whole >= 0 ? (out[n - whole] ?? 0) : 0;
    const b = n - whole - 1 >= 0 ? (out[n - whole - 1] ?? 0) : 0;
    const delayed = a * (1 - fraction) + b * fraction;
    const value = (n < burst ? (excitation[n] ?? 0) : 0) + loss * 0.5 * (delayed + previous);
    previous = delayed;
    out[n] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let n = 0; n < length; n++) out[n] = (out[n] ?? 0) / peak;
  return out;
}

function pluckBuffer(ctx: BaseAudioContext, sound: string, frequency: number): AudioBuffer {
  const key = `${sound}:${frequency.toFixed(3)}:${ctx.sampleRate}`;
  let buffer = pluckCache.get(key);
  if (!buffer) {
    const pluck = PLUCKS[sound] ?? PLUCKS.guitar!;
    const samples = pluckSamples(frequency, ctx.sampleRate, pluck);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    if (pluckCache.size > 400) pluckCache.clear();
    pluckCache.set(key, buffer);
  }
  return buffer;
}

function plucked(ctx: BaseAudioContext, out: AudioNode, sound: string, frequency: number, start: number, level: number): Voice {
  const source = ctx.createBufferSource();
  source.buffer = pluckBuffer(ctx, sound === "guitar-drop-d" ? "guitar" : sound, frequency);
  // Caisse de résonance : une bosse dans le grave, un peu de présence.
  const body = ctx.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = sound === "bass" ? 90 : 180;
  body.Q.value = 1.2;
  body.gain.value = 4;
  const gain = ctx.createGain();
  gain.gain.value = level * (sound === "bass" ? 1.5 : 1.2);
  source.connect(body).connect(gain).connect(out);
  source.start(start);
  return releaser(ctx, gain, [source], sound === "bass" ? 0.12 : 0.25);
}

// ------------------------------------------------------------ piano

function piano(ctx: BaseAudioContext, out: AudioNode, frequency: number, start: number, level: number): Voice {
  const master = ctx.createGain();
  master.gain.value = level;
  master.connect(out);
  const sources: AudioScheduledSourceNode[] = [];
  // Un grave tient plus longtemps qu'un aigu.
  const sustain = Math.min(6, Math.max(0.8, 4.5 * Math.sqrt(130 / frequency)));
  const inharmonicity = 0.0004;
  [1, 0.5, 0.3, 0.16, 0.08, 0.04].forEach((amplitude, index) => {
    const n = index + 1;
    const partial = frequency * n * Math.sqrt(1 + inharmonicity * n * n);
    if (partial > 16000) return;
    const oscillator = ctx.createOscillator();
    oscillator.frequency.value = partial;
    // Léger désaccord entre les cordes d'un même chœur.
    oscillator.detune.value = n === 1 ? 1.5 : 0;
    const gain = envelope(ctx, start, amplitude, 0.004, 0, sustain / (n * 1.4));
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    sources.push(oscillator);
  });
  // Choc du marteau : bruit bref filtré autour de la note.
  const hammer = ctx.createBufferSource();
  hammer.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = Math.min(5000, frequency * 4);
  band.Q.value = 0.8;
  const knock = envelope(ctx, start, 0.12, 0.001, 0, 0.012);
  hammer.connect(band).connect(knock).connect(master);
  hammer.start(start);
  hammer.stop(start + 0.1);
  return releaser(ctx, master, sources, 0.35);
}

// ------------------------------------------------------------ souffle et archet

interface Sustained {
  waves: [OscillatorType, number, number][];
  attack: number;
  release: number;
  /** Formants (fréquence, gain dB, Q). */
  formants: [number, number, number][];
  lowpass: number;
  vibrato: { rate: number; cents: number; delay: number };
  breath: number;
}

const SUSTAINED: Record<string, Sustained> = {
  violin: {
    waves: [["sawtooth", 1, 1]],
    attack: 0.09,
    release: 0.18,
    formants: [[280, 5, 2], [2500, 6, 2.5], [3800, 3, 3]],
    lowpass: 7000,
    vibrato: { rate: 5.6, cents: 14, delay: 0.25 },
    breath: 0.02,
  },
  cello: {
    waves: [["sawtooth", 1, 1]],
    attack: 0.12,
    release: 0.25,
    formants: [[200, 5, 2], [1200, 4, 2], [2800, 3, 3]],
    lowpass: 4500,
    vibrato: { rate: 5, cents: 12, delay: 0.3 },
    breath: 0.02,
  },
  flute: {
    waves: [["sine", 1, 1], ["sine", 2, 0.12], ["sine", 3, 0.04]],
    attack: 0.06,
    release: 0.12,
    formants: [],
    lowpass: 9000,
    vibrato: { rate: 5, cents: 10, delay: 0.2 },
    breath: 0.08,
  },
  "alto-saxophone": {
    waves: [["sawtooth", 1, 0.7], ["square", 1, 0.3]],
    attack: 0.04,
    release: 0.1,
    formants: [[700, 6, 1.5], [1700, 5, 2], [3000, 3, 3]],
    lowpass: 4200,
    vibrato: { rate: 5.2, cents: 9, delay: 0.3 },
    breath: 0.04,
  },
  "tenor-saxophone": {
    waves: [["sawtooth", 1, 0.75], ["square", 1, 0.25]],
    attack: 0.05,
    release: 0.12,
    formants: [[500, 6, 1.5], [1400, 5, 2], [2600, 3, 3]],
    lowpass: 3400,
    vibrato: { rate: 5, cents: 10, delay: 0.3 },
    breath: 0.04,
  },
  synthesizer: {
    waves: [["sawtooth", 1, 0.5], ["sawtooth", 1.004, 0.5], ["square", 0.5, 0.25]],
    attack: 0.01,
    release: 0.2,
    formants: [],
    lowpass: 2600,
    vibrato: { rate: 0, cents: 0, delay: 0 },
    breath: 0,
  },
};

function sustained(ctx: BaseAudioContext, out: AudioNode, sound: string, frequency: number, start: number, level: number): Voice {
  const spec = SUSTAINED[sound] ?? SUSTAINED.synthesizer!;
  const amp = envelope(ctx, start, level, spec.attack, 0.85, 0.3);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(spec.lowpass, frequency * 14);
  if (sound === "synthesizer") {
    // Balayage du filtre à l'attaque, comme un synthétiseur analogique.
    lowpass.Q.value = 4;
    lowpass.frequency.setValueAtTime(Math.min(9000, frequency * 10), start);
    lowpass.frequency.setTargetAtTime(Math.min(spec.lowpass, frequency * 4), start, 0.12);
  }
  const sources: AudioScheduledSourceNode[] = [];
  const mix = ctx.createGain();
  mix.connect(lowpass);
  let last: AudioNode = lowpass;
  for (const [f, gain, q] of spec.formants) {
    const peak = ctx.createBiquadFilter();
    peak.type = "peaking";
    peak.frequency.value = f;
    peak.gain.value = gain;
    peak.Q.value = q;
    last.connect(peak);
    last = peak;
  }
  last.connect(amp).connect(out);

  let vibratoGain: GainNode | undefined;
  if (spec.vibrato.rate > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = spec.vibrato.rate;
    vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(0, start);
    vibratoGain.gain.linearRampToValueAtTime(spec.vibrato.cents, start + spec.vibrato.delay + 0.3);
    lfo.connect(vibratoGain);
    lfo.start(start);
    sources.push(lfo);
  }
  for (const [type, ratio, gain] of spec.waves) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency * ratio;
    if (vibratoGain) vibratoGain.connect(oscillator.detune);
    const partial = ctx.createGain();
    partial.gain.value = gain * (type === "sine" ? 1 : 0.35);
    oscillator.connect(partial).connect(mix);
    oscillator.start(start);
    sources.push(oscillator);
  }
  if (spec.breath > 0) {
    const air = ctx.createBufferSource();
    air.buffer = noise(ctx);
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(8000, frequency * 2);
    band.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = spec.breath;
    air.connect(band).connect(gain).connect(mix);
    air.start(start, Math.random() * 1.5);
    sources.push(air);
  }
  return releaser(ctx, amp, sources, spec.release);
}

// ------------------------------------------------------------ batterie

/** Pièces de batterie, numérotation General MIDI. */
export const DRUM_PIECES: { midi: number; name: string }[] = [
  { midi: 36, name: "Grosse caisse" },
  { midi: 38, name: "Caisse claire" },
  { midi: 39, name: "Clap" },
  { midi: 42, name: "Charleston fermé" },
  { midi: 44, name: "Charleston au pied" },
  { midi: 46, name: "Charleston ouvert" },
  { midi: 43, name: "Tom basse" },
  { midi: 45, name: "Tom grave" },
  { midi: 47, name: "Tom médium" },
  { midi: 50, name: "Tom aigu" },
  { midi: 49, name: "Crash" },
  { midi: 51, name: "Ride" },
];

const NONE: Voice = { release() {} };

function noiseHit(ctx: BaseAudioContext, out: AudioNode, start: number, level: number, type: BiquadFilterType, frequency: number, q: number, decay: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = envelope(ctx, start, level, 0.001, 0, decay);
  source.connect(filter).connect(gain).connect(out);
  source.start(start, Math.random());
  source.stop(start + decay * 8);
}

function toneHit(ctx: BaseAudioContext, out: AudioNode, start: number, level: number, from: number, to: number, sweep: number, decay: number): void {
  const oscillator = ctx.createOscillator();
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + sweep);
  const gain = envelope(ctx, start, level, 0.002, 0, decay);
  oscillator.connect(gain).connect(out);
  oscillator.start(start);
  oscillator.stop(start + decay * 8);
}

function drum(ctx: BaseAudioContext, out: AudioNode, midi: number, start: number, level: number): Voice {
  const l = level * 2.2;
  switch (midi) {
    case 35:
    case 36:
      toneHit(ctx, out, start, l * 1.4, 150, 45, 0.09, 0.12);
      noiseHit(ctx, out, start, l * 0.15, "lowpass", 1500, 0.7, 0.006);
      break;
    case 38:
    case 40:
      toneHit(ctx, out, start, l * 0.6, 260, 180, 0.04, 0.05);
      noiseHit(ctx, out, start, l * 0.7, "highpass", 1400, 0.8, 0.06);
      break;
    case 39:
      for (const offset of [0, 0.011, 0.022]) noiseHit(ctx, out, start + offset, l * 0.6, "bandpass", 1300, 2, offset === 0.022 ? 0.05 : 0.006);
      break;
    case 42:
    case 44:
      noiseHit(ctx, out, start, l * (midi === 44 ? 0.3 : 0.4), "highpass", 7500, 1, midi === 44 ? 0.015 : 0.02);
      break;
    case 46:
      noiseHit(ctx, out, start, l * 0.4, "highpass", 7000, 1, 0.12);
      break;
    case 49:
    case 57:
      noiseHit(ctx, out, start, l * 0.45, "highpass", 5000, 0.6, 0.45);
      break;
    case 51:
    case 59:
      noiseHit(ctx, out, start, l * 0.25, "bandpass", 6500, 1.5, 0.25);
      toneHit(ctx, out, start, l * 0.06, 2900, 2900, 0.01, 0.3);
      break;
    case 41:
    case 43:
    case 45:
    case 47:
    case 48:
    case 50: {
      const base = { 41: 70, 43: 82, 45: 100, 47: 125, 48: 150, 50: 180 }[midi] ?? 100;
      toneHit(ctx, out, start, l, base * 1.6, base, 0.06, 0.18);
      break;
    }
    default:
      noiseHit(ctx, out, start, l * 0.3, "bandpass", 2000 + (midi % 12) * 300, 2, 0.05);
  }
  return NONE;
}

// ------------------------------------------------------------ entrée

/**
 * Démarre une note de l'instrument `sound` à l'instant `start` (horloge
 * audio). Pour la batterie, `midi` désigne la pièce et `frequency` est
 * ignorée.
 */
export function startVoice(
  ctx: BaseAudioContext,
  out: AudioNode,
  sound: string,
  midi: number,
  frequency: number,
  start: number,
  level: number,
): Voice {
  if (sound === "drum-kit") return drum(ctx, out, midi, start, level);
  if (sound in PLUCKS || sound === "guitar-drop-d") return plucked(ctx, out, sound, frequency, start, level);
  if (sound in SUSTAINED) return sustained(ctx, out, sound, frequency, start, level);
  return piano(ctx, out, frequency, start, level);
}
