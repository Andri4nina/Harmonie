import { useEffect, useRef } from "react";
import { useSettings } from "../state/store";

/**
 * Le relief : lignes de niveau d'un champ scalaire lent, tracées par
 * « marching squares ». Une courbe sur cinq est maîtresse (trait continu),
 * les autres sont tiretées.
 */

const CELL = 14;
const LEVELS = 15;
const FRAME_INTERVAL = 100;

// [fréquence x, fréquence y, phase, vitesse, amplitude]
const WAVES: [number, number, number, number, number][] = [
  [1.1, 0.7, 0.0, 0.9, 1.0],
  [0.6, 1.5, 1.7, -0.6, 0.7],
  [1.9, 1.2, 3.1, 0.4, 0.45],
  [0.4, 0.5, 4.4, -0.3, 0.6],
];

function height(x: number, y: number, t: number): number {
  let value = 0;
  for (const [kx, ky, phase, speed, amplitude] of WAVES) {
    value += Math.sin(x * kx + phase + t * speed) * Math.cos(y * ky - phase * 0.7 + t * speed * 0.6) * amplitude;
  }
  return value;
}

// Pour chaque configuration de coins, les arêtes reliées
// (0 = haut, 1 = droite, 2 = bas, 3 = gauche).
const SEGMENTS: number[][] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 3, 2, 1],
  [0, 2],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 1, 3, 2],
  [0, 1],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];

function draw(canvas: HTMLCanvasElement, time: number, hue: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = canvas.clientWidth;
  const heightPx = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(heightPx * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(heightPx * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, heightPx);

  const cols = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(heightPx / CELL) + 1;
  const scale = 3.2 / Math.max(width, 900);
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      values[j * cols + i] = height(i * CELL * scale * 2.2, j * CELL * scale * 2.2, time);
    }
  }

  const master = new Path2D();
  const dashed = new Path2D();
  // Point d'intersection de la courbe avec une arête de la cellule.
  const edgePoint = (edge: number, i: number, j: number, a: number, b: number, c: number, d: number, level: number) => {
    const x = i * CELL;
    const y = j * CELL;
    switch (edge) {
      case 0:
        return [x + ((level - a) / (b - a)) * CELL, y] as const;
      case 1:
        return [x + CELL, y + ((level - b) / (c - b)) * CELL] as const;
      case 2:
        return [x + ((level - d) / (c - d)) * CELL, y + CELL] as const;
      default:
        return [x, y + ((level - a) / (d - a)) * CELL] as const;
    }
  };

  for (let n = 0; n < LEVELS; n++) {
    const level = -2.1 + (n * 4.2) / (LEVELS - 1);
    const isMaster = n % 5 === 2;
    const path = isMaster ? master : dashed;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        // Le tireté : une cellule sur deux, en damier.
        if (!isMaster && (i + j) % 2 === 1) continue;
        const a = values[j * cols + i] ?? 0;
        const b = values[j * cols + i + 1] ?? 0;
        const c = values[(j + 1) * cols + i + 1] ?? 0;
        const d = values[(j + 1) * cols + i] ?? 0;
        const index = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        const segments = SEGMENTS[index] ?? [];
        for (let s = 0; s < segments.length; s += 2) {
          const [x1, y1] = edgePoint(segments[s] ?? 0, i, j, a, b, c, d, level);
          const [x2, y2] = edgePoint(segments[s + 1] ?? 0, i, j, a, b, c, d, level);
          path.moveTo(x1, y1);
          path.lineTo(x2, y2);
        }
      }
    }
  }

  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.strokeStyle = `hsl(${hue} 55% 72% / 0.17)`;
  ctx.stroke(dashed);
  ctx.strokeStyle = `hsl(${hue} 60% 74% / 0.3)`;
  ctx.stroke(master);
}

export function TopoBackground({ hue }: { hue: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lite = useSettings((state) => state.lite);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const still = lite || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;
    const render = (now: number) => {
      if (now - last >= FRAME_INTERVAL) {
        last = now;
        draw(canvas, still ? 0 : now * 0.00005, hue);
      }
      if (!still && !document.hidden) frame = requestAnimationFrame(render);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      last = 0;
      frame = requestAnimationFrame(render);
    };
    // Le relief ne démarre qu'une fois la page chargée et le navigateur au
    // repos : il ne doit retarder ni l'affichage ni l'interactivité.
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 200));
    let started = false;
    const start = () =>
      idle(() => {
        started = true;
        restart();
      });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    const onChange = () => {
      if (started) restart();
    };
    window.addEventListener("resize", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      started = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("load", start);
      window.removeEventListener("resize", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [hue, lite]);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
