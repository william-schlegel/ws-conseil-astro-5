/**
 * Spirale d'Archimède — le motif du logo WS Conseil, décliné dans l'interface
 * (indicateur de défilement, galaxie des technos, ornements).
 */

export interface SpiralOptions {
  cx: number;
  cy: number;
  /** rayon de départ (centre) */
  r0: number;
  /** rayon d'arrivée (bord) */
  r1: number;
  turns: number;
  /** angle de départ en radians */
  start?: number;
}

export function spiralPoint(
  { cx, cy, r0, r1, turns, start = 0 }: SpiralOptions,
  t: number,
): { x: number; y: number; angle: number } {
  const angle = start + t * turns * Math.PI * 2;
  const r = r0 + (r1 - r0) * t;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, angle };
}

/** Chemin SVG (polyligne dense) du centre vers le bord. */
export function spiralPath(options: SpiralOptions, steps = 220): string {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const { x, y } = spiralPoint(options, i / steps);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

/**
 * Répartit `count` points à intervalles d'arc (presque) réguliers le long de
 * la spirale : `t` suit une loi en racine carrée, ce qui compense
 * l'allongement des spires extérieures.
 */
export function spiralLayout(
  options: SpiralOptions,
  count: number,
  tMin = 0.12,
): Array<{ x: number; y: number; t: number }> {
  const out: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 0; i < count; i++) {
    const k = count === 1 ? 1 : i / (count - 1);
    const t = Math.sqrt(tMin * tMin + (1 - tMin * tMin) * k);
    const { x, y } = spiralPoint(options, t);
    out.push({ x, y, t });
  }
  return out;
}
