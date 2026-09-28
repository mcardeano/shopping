/** Row → domain mapping helpers shared by repositories. */
export function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return new Date(v).toISOString();
  return new Date(0).toISOString();
}

export function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v);
}

export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

export function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("{")) {
    return v
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map((s) => s.replace(/^"|"$/g, ""));
  }
  return [];
}

export function dateOnly(v: unknown): string {
  if (v instanceof Date) {
    // DATE columns come back as local-midnight Dates; format without timezone shifts.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
