import { useEffect, useRef } from "react";
import { getAnalyser } from "../audio/synth";
import { usePlayer } from "../state/store";

const BANDS = 40;
const LOW_HZ = 60;
const HIGH_HZ = 9000;

/**
 * Analyseur de spectre : énergie réelle du son en cours de lecture, par
 * bandes réparties logarithmiquement (comme l'oreille perçoit les hauteurs).
 * Rien n'est dessiné quand rien ne sonne.
 */
export function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playing = usePlayer((state) => state.playingId !== null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const color = getComputedStyle(canvas).color;
    const bandWidth = width / BANDS;

    const paint = (levels: number[]) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      levels.forEach((level, band) => {
        const barHeight = Math.max(1.5, level * (height - 2));
        ctx.globalAlpha = 0.35 + level * 0.65;
        ctx.fillRect(band * bandWidth + 1, height - barHeight, bandWidth - 2, barHeight);
      });
      ctx.globalAlpha = 1;
    };

    const analyser = getAnalyser();
    if (!playing || !analyser) {
      paint(new Array<number>(BANDS).fill(0));
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      const levels: number[] = [];
      for (let band = 0; band < BANDS; band++) {
        const from = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (band / BANDS);
        const to = LOW_HZ * (HIGH_HZ / LOW_HZ) ** ((band + 1) / BANDS);
        const first = Math.floor(from / hzPerBin);
        const last = Math.max(first, Math.min(bins.length - 1, Math.floor(to / hzPerBin)));
        let peak = 0;
        for (let bin = first; bin <= last; bin++) peak = Math.max(peak, bins[bin] ?? 0);
        levels.push(peak / 255);
      }
      paint(levels);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Spectre du son en cours de lecture"
      className="h-12 w-56 text-[var(--accent)]"
    />
  );
}
