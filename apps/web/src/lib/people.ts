import type { Member } from "../api/client";

export const nameOf = (m: Member | undefined, you = "You") => (!m ? "Someone" : m.isMe ? you : m.displayName);
export const firstName = (m: Member | undefined, you = "You") => nameOf(m, you).split(" ")[0]!;

/** Category tile colours from the design system (Stats "where it went" uses the same set). */
export const CATEGORIES = [
  { key: "food", label: "Food", color: "#F28C38" },
  { key: "travel", label: "Travel", color: "#3A7BD5" },
  { key: "stay", label: "Stay", color: "#2F6B4F" },
  { key: "drinks", label: "Drinks", color: "#8E5BD9" },
  { key: "fun", label: "Fun", color: "#E2557A" },
  { key: "shopping", label: "Shopping", color: "#C9A227" },
  { key: "other", label: "Other", color: "#9AA59D" },
] as const;
export const tileColor = (category: string | null) => CATEGORIES.find((c) => c.key === category)?.color ?? "#9AA59D";

/** Trip accents: Goa, Manali, Jaipur. */
export const ACCENT_CHOICES = [
  { name: "Goa", hex: "#F4D23C" },
  { name: "Manali", hex: "#3FD0B6" },
  { name: "Jaipur", hex: "#5C8DFF" },
] as const;

export function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7 && diff > 0) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return when(iso);
}

/** Group label like "TODAY", "YESTERDAY", "SAT 13 DEC". */
export function dayLabel(iso: string): string {
  const w = when(iso);
  if (w === "Today" || w === "Yesterday") return w.toUpperCase();
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
}
