/** Default trip colour: black. */
export const DEFAULT_ACCENT = "#121316";

/** Trip colour swatches. Any other colour comes from the custom picker. */
export const ACCENT_SWATCHES = ["#121316", "#F4D23C", "#3FD0B6", "#5C8DFF", "#FF7A59", "#E2557A", "#8E5BD9", "#2FA372"] as const;

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Relative luminance (WCAG) of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}

export const isDark = (hex: string) => luminance(hex) < 0.22;

/** Text colour that reads on top of a trip colour: ink on light colours, white on dark ones. */
export const inkOn = (hex: string | null | undefined) => (isDark(hex ?? DEFAULT_ACCENT) ? "#FFFFFF" : "#121316");

export const accentOr = (hex: string | null | undefined) => hex ?? DEFAULT_ACCENT;
