export const TW = 128;
export const TH = 64;

/** Grid slots around the HQ plaza at (0,0), nearest first. */
export const SLOTS: Array<[number, number]> = [
  [-3, 0],
  [0, -3],
  [3, 0],
  [0, 3],
  [-3, -3],
  [3, 3],
  [3, -3],
  [-3, 3],
  [-6, 0],
  [0, -6],
  [6, 0],
  [0, 6],
];

export function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 };
}

export function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const ch = (i: number) => {
    const v = parseInt(m[i]!, 16);
    const out = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.max(0, Math.min(255, Math.round(out)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(1)}${ch(2)}${ch(3)}`;
}

export function diamond(cx: number, cy: number, a: number, b: number, lift = 0): string {
  return [
    [cx, cy - b - lift],
    [cx + a, cy - lift],
    [cx, cy + b - lift],
    [cx - a, cy - lift],
  ]
    .map((p) => p.join(","))
    .join(" ");
}
