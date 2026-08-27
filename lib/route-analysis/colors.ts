// A palette chosen for maximum distinguishability on a map, in a fixed
// order. Deliberately avoids yellow/orange/amber tones — those colors
// are already used for roads/highways on the base map, so a route in
// that hue range is easy to mistake for a road. Colors are assigned
// per-dataset for the selected date only — they are NOT stable/permanent
// per cleaner.
const PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#dc2626", // red
  "#0891b2", // cyan
  "#db2777", // pink
  "#4f46e5", // indigo
  "#0d9488", // teal
  "#7c3aed", // violet
  "#be123c", // rose
  "#0284c7", // sky
  "#059669", // emerald
];

export function assignColors(teamKeys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  teamKeys.forEach((key, i) => {
    map.set(key, PALETTE[i % PALETTE.length] ?? "#2563eb");
  });
  return map;
}
