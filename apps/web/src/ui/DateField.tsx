import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./Sheet";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const display = (iso: string) => {
  const d = fromIso(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "";
};

/** "21/12/2026", "21-12-26", "21 12 2026" -> ISO date, or null if it isn't a real date. */
export function parseTyped(text: string): string | null {
  const m = /^(\d{1,2})\D+(\d{1,2})\D+(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toIso(d);
}

/** Insert slashes while typing digits: 2112 -> 21/12, 21122026 -> 21/12/2026. */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

interface DateFieldProps {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  min?: string;
  label: string;
  className?: string;
  /** Which edge the calendar lines up with (use "right" for a field on the right half). */
  align?: "left" | "right";
}

/** Date input you can type into (DD/MM/YYYY) or pick from a calendar. */
export function DateField({ value, onChange, min, label, className = "", align = "left" }: DateFieldProps) {
  const [text, setText] = useState(display(value));
  const [open, setOpen] = useState(false);
  const [bad, setBad] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const initial = fromIso(value) ?? fromIso(min ?? "") ?? new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  useEffect(() => setText(display(value)), [value]);

  function commit(t: string) {
    if (!t.trim()) {
      setBad(false);
      return onChange("");
    }
    const iso = parseTyped(t);
    setBad(!iso || Boolean(min && iso < min));
    if (iso && !(min && iso < min)) onChange(iso);
  }

  const days = useMemo(() => {
    const first = (month.getDay() + 6) % 7; // Monday first
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array<null>(first).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);
  const today = toIso(new Date());

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className={`flex h-[52px] items-center rounded-[16px] bg-card pr-1.5 pl-4 ring-1 transition-shadow focus-within:ring-2 ${bad ? "ring-2 ring-neg" : "ring-black/5 focus-within:ring-cobalt"}`}>
        <input
          value={text}
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          aria-label={label}
          aria-invalid={bad}
          onChange={(e) => {
            const t = mask(e.target.value);
            setText(t);
            if (t.length === 10) commit(t);
          }}
          onBlur={() => commit(text)}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tabular-nums text-ink outline-none placeholder:text-[#A2A7B2]"
        />
        <button
          type="button"
          aria-label={`Pick ${label.toLowerCase()} from a calendar`}
          aria-expanded={open}
          onClick={() => {
            const d = fromIso(value) ?? fromIso(min ?? "") ?? new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            setOpen((o) => !o);
          }}
          className={`grid h-10 w-10 place-items-center rounded-[12px] transition-colors ${open ? "bg-ink text-white" : "bg-sheet text-ink"}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="rounded-[var(--radius-card)] bg-card p-3">
          <div className="flex items-center justify-between px-1 pb-2">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-full bg-sheet text-[18px]">
                ‹
              </button>
              <b className="text-[15px] font-semibold">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
              <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-full bg-sheet text-[18px]">
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
              {WEEK.map((w, i) => (
                <span key={i} className="py-1">{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {days.map((d, i) => {
                if (!d) return <span key={i} />;
                const iso = toIso(d);
                const sel = iso === value;
                const disabled = Boolean(min && iso < min);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(iso);
                      setBad(false);
                      setOpen(false);
                    }}
                    className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-[14px] font-medium tabular-nums transition-colors disabled:opacity-25 ${
                      sel ? "bg-ink font-bold text-white" : iso === today ? "ring-1 ring-ink" : "hover:bg-sheet"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-2 h-9 w-full rounded-full text-[13px] font-semibold text-muted">
                Clear date
              </button>
            )}
        </div>
      </Sheet>
    </div>
  );
}
