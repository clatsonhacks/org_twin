import type { TeamView } from "./model";

export interface Plot {
  key: string;
  x: number;
  z: number;
  floors: number;
  color: string;
  face: number;
}

export interface WorldLayout {
  radius: number;
  plots: Plot[];
  pathTiles: Set<string>;
  trees: [number, number][];
  route: (from: string, to: string) => [number, number, number][];
}

/** Island layout: teams on a ring around the HQ, stone paths to each door, a few trees at the back. */
export function buildLayout(teams: TeamView[]): WorldLayout {
  const n = Math.max(1, teams.length);
  // More teams need a wider ring so buildings don't touch.
  const ring = Math.max(9, Math.ceil((n * 5.2) / (Math.PI * 2)));
  const radius = ring + 5;
  const plots: Plot[] = teams.map((t, i) => {
    const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI * 0.75;
    const x = Math.round(Math.cos(a) * ring);
    const z = Math.round(Math.sin(a) * ring);
    return {
      key: t.key,
      x,
      z,
      color: t.color,
      floors: Math.min(5, 1 + Math.ceil(t.headcount / 3)),
      // front faces the HQ
      face: Math.atan2(-x, -z),
    };
  });

  const pathTiles = new Set<string>();
  const lpath = (p: Plot) => {
    const pts: [number, number][] = [];
    const sx = Math.sign(p.x);
    const sz = Math.sign(p.z);
    for (let x = 0; x !== p.x; x += sx || 1) {
      pts.push([x, 0]);
      if (!sx) break;
    }
    for (let z = 0; z !== p.z; z += sz || 1) {
      pts.push([p.x, z]);
      if (!sz) break;
    }
    return pts;
  };
  plots.forEach((p) => lpath(p).forEach(([x, z]) => pathTiles.add(`${x},${z}`)));

  const occupied = (x: number, z: number) =>
    (Math.abs(x) <= 2 && Math.abs(z) <= 2) ||
    plots.some((p) => Math.abs(p.x - x) <= 2 && Math.abs(p.z - z) <= 2) ||
    [...pathTiles].some((k) => {
      const [px = 0, pz = 0] = k.split(",").map(Number);
      return Math.abs(px - x) <= 1 && Math.abs(pz - z) <= 1;
    });

  const trees: [number, number][] = [];
  let seed = 7 + teams.length * 13;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 600 && trees.length < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = radius - 1.5 - rnd() * 1.5;
    const x = Math.round(Math.cos(a) * d);
    const z = Math.round(Math.sin(a) * d);
    if (x + z > -3) continue; // the camera looks from +x+z: keep trees behind everything
    if (occupied(x, z) || trees.some(([tx, tz]) => Math.abs(tx - x) < 3 && Math.abs(tz - z) < 3)) continue;
    trees.push([x, z]);
  }

  const byKey = new Map(plots.map((p) => [p.key, p]));
  const route = (from: string, to: string): [number, number, number][] => {
    const a = byKey.get(from);
    const b = byKey.get(to);
    if (!a || !b) return [];
    const y = 0.9;
    return [
      [a.x, y, a.z],
      [a.x, y, 0],
      [0, y, 0],
      [b.x, y, 0],
      [b.x, y, b.z],
    ];
  };

  return { radius, plots, pathTiles, trees, route };
}
