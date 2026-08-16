export type Direction = "left" | "right" | "neutral";

export const TAB_ORDER = [
  "/",
  "/entries",
  "/clients",
  "/reports",
  "/settings",
] as const;

export type TabPath = (typeof TAB_ORDER)[number];

const positionOf = new Map<string, number>(
  TAB_ORDER.map((path, i) => [path, i]),
);

export function routeDirection(
  from: string | null | undefined,
  to: string | null | undefined,
): Direction {
  if (from == null || to == null) return "neutral";
  const a = positionOf.get(from);
  const b = positionOf.get(to);
  if (a === undefined || b === undefined || a === b) return "neutral";
  return b > a ? "right" : "left";
}
