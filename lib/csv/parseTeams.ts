/**
 * Parses the "Teams Assigned" cell, e.g.:
 *   "1054: Gabriel Baldonado, 1536: Payton Limon"
 * into a single team/route identity. A multi-person team is ONE route,
 * never split into independent routes.
 */
export function parseTeamsAssigned(raw: string): {
  teamKey: string;
  teamLabel: string;
} {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { teamKey: "unassigned", teamLabel: "Unassigned" };
  }

  // Split on commas that separate "ID: Name" pairs
  const members = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+)\s*:\s*(.+)$/);
      if (match && match[1] && match[2]) {
        return { id: match[1], name: match[2].trim() };
      }
      return { id: part, name: part };
    });

  // Stable key: sorted numeric IDs joined together, so the same pair
  // always maps to the same route regardless of listed order.
  const teamKey = members
    .map((m) => m.id)
    .sort()
    .join("+");

  const teamLabel =
    members.length === 1 && members[0]
      ? members[0].name
      : members.map((m) => m.name).join(" & ");

  return { teamKey, teamLabel };
}
