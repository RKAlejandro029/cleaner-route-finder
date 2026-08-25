// A palette chosen for maximum distinguishability on a map, in a fixed
// order. Colors are assigned per-dataset for the selected date only —
// they are NOT stable/permanent per cleaner.
const PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#ea580c", // orange
  "#dc2626", // red
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#db2777", // pink
  "#4d7c0f", // olive
  "#7c3aed", // violet
  "#0d9488", // teal
  "#b91c1c", // dark red
];

export function assignColors(teamKeys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  teamKeys.forEach((key, i) => {
    map.set(key, PALETTE[i % PALETTE.length] ?? "#2563eb");
  });
  return map;
}
