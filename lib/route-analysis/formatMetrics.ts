export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function formatMiles(meters: number): string {
  const miles = metersToMiles(meters);
  const sign = miles < 0 ? "-" : "+";
  return `${sign}${Math.abs(miles).toFixed(1)} miles`;
}

export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const minutes = Math.round(abs / 60);
  if (minutes < 60) return `${sign}${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${sign}${hours}h ${remMinutes}m`;
}
