import { useQuery } from "@tanstack/react-query";
import { api, unwrap, type Schemas } from "../api/client";

export type FxRates = Schemas["FxRates"];
export type ExpenseFx = Schemas["ExpenseFx"];

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  /** Digits after the point people actually use (yen and rupiah have none). */
  decimals: number;
}

/** Where people from India travel most, roughly in that order. Anything else is searchable by code. */
export const CURRENCIES: Currency[] = [
  { code: "INR", name: "Indian rupee", symbol: "₹", flag: "🇮🇳", decimals: 2 },
  { code: "USD", name: "US dollar", symbol: "$", flag: "🇺🇸", decimals: 2 },
  { code: "AED", name: "UAE dirham", symbol: "AED ", flag: "🇦🇪", decimals: 2 },
  { code: "THB", name: "Thai baht", symbol: "฿", flag: "🇹🇭", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", decimals: 2 },
  { code: "GBP", name: "British pound", symbol: "£", flag: "🇬🇧", decimals: 2 },
  { code: "SGD", name: "Singapore dollar", symbol: "S$", flag: "🇸🇬", decimals: 2 },
  { code: "IDR", name: "Indonesian rupiah", symbol: "Rp ", flag: "🇮🇩", decimals: 0 },
  { code: "VND", name: "Vietnamese dong", symbol: "₫", flag: "🇻🇳", decimals: 0 },
  { code: "MYR", name: "Malaysian ringgit", symbol: "RM ", flag: "🇲🇾", decimals: 2 },
  { code: "LKR", name: "Sri Lankan rupee", symbol: "Rs ", flag: "🇱🇰", decimals: 2 },
  { code: "NPR", name: "Nepalese rupee", symbol: "Rs ", flag: "🇳🇵", decimals: 2 },
  { code: "MVR", name: "Maldivian rufiyaa", symbol: "Rf ", flag: "🇲🇻", decimals: 2 },
  { code: "BTN", name: "Bhutanese ngultrum", symbol: "Nu ", flag: "🇧🇹", decimals: 2 },
  { code: "JPY", name: "Japanese yen", symbol: "¥", flag: "🇯🇵", decimals: 0 },
  { code: "KRW", name: "South Korean won", symbol: "₩", flag: "🇰🇷", decimals: 0 },
  { code: "AUD", name: "Australian dollar", symbol: "A$", flag: "🇦🇺", decimals: 2 },
  { code: "CAD", name: "Canadian dollar", symbol: "C$", flag: "🇨🇦", decimals: 2 },
  { code: "CHF", name: "Swiss franc", symbol: "CHF ", flag: "🇨🇭", decimals: 2 },
  { code: "TRY", name: "Turkish lira", symbol: "₺", flag: "🇹🇷", decimals: 2 },
  { code: "SAR", name: "Saudi riyal", symbol: "SAR ", flag: "🇸🇦", decimals: 2 },
  { code: "QAR", name: "Qatari riyal", symbol: "QAR ", flag: "🇶🇦", decimals: 2 },
  { code: "OMR", name: "Omani rial", symbol: "OMR ", flag: "🇴🇲", decimals: 3 },
  { code: "HKD", name: "Hong Kong dollar", symbol: "HK$", flag: "🇭🇰", decimals: 2 },
  { code: "CNY", name: "Chinese yuan", symbol: "¥", flag: "🇨🇳", decimals: 2 },
  { code: "PHP", name: "Philippine peso", symbol: "₱", flag: "🇵🇭", decimals: 2 },
  { code: "NZD", name: "New Zealand dollar", symbol: "NZ$", flag: "🇳🇿", decimals: 2 },
  { code: "ZAR", name: "South African rand", symbol: "R ", flag: "🇿🇦", decimals: 2 },
  { code: "EGP", name: "Egyptian pound", symbol: "E£", flag: "🇪🇬", decimals: 2 },
  { code: "KES", name: "Kenyan shilling", symbol: "KSh ", flag: "🇰🇪", decimals: 2 },
  { code: "GEL", name: "Georgian lari", symbol: "₾", flag: "🇬🇪", decimals: 2 },
  { code: "AZN", name: "Azerbaijani manat", symbol: "₼", flag: "🇦🇿", decimals: 2 },
  { code: "KZT", name: "Kazakh tenge", symbol: "₸", flag: "🇰🇿", decimals: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyOf(code: string): Currency {
  return BY_CODE.get(code) ?? { code, name: code, symbol: `${code} `, flag: "🏳️", decimals: 2 };
}

/** "$20.50", "฿1,250", "Rp 150,000" in the way people read prices. */
export function formatMoney(amount: number, code: string): string {
  const c = currencyOf(code);
  const n = amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : c.decimals, maximumFractionDigits: c.decimals });
  return `${c.symbol}${n}`;
}

/** "1 USD = ₹84.12", or for weak currencies "1,000 IDR = ₹5.28" so the rupee figure stays readable. */
export function rateLine(code: string, inrPer: number): string {
  let unit = 1;
  while (inrPer * unit < 1 && unit < 1_000_000) unit *= 10;
  const inr = inrPer * unit;
  return `${unit.toLocaleString("en-IN")} ${code} = ₹${inr.toLocaleString("en-IN", { maximumFractionDigits: inr >= 10 ? 2 : 3 })}`;
}

/** Foreign amount -> integer paise. */
export const toInrPaise = (amount: number, inrPer: number) => Math.round(amount * inrPer * 100);

export function useFxRates(enabled = true) {
  return useQuery({
    queryKey: ["fx", "rates"],
    enabled,
    queryFn: () => unwrap(api.GET("/api/v1/fx/rates")),
    // Sources publish daily; refreshing every half hour is plenty. The persisted cache keeps the last
    // rates on the phone, so converting still works abroad with no signal.
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** "just now", "12 min ago", "5h ago", "2 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const lastKey = (groupId: string) => `ls:fx:${groupId}`;
/** The currency last used in a trip, so a week in Bangkok doesn't mean picking THB every time. */
export function lastCurrency(groupId: string): string {
  try {
    return localStorage.getItem(lastKey(groupId)) || "INR";
  } catch {
    return "INR";
  }
}
export function rememberCurrency(groupId: string, code: string) {
  try {
    if (code === "INR") localStorage.removeItem(lastKey(groupId));
    else localStorage.setItem(lastKey(groupId), code);
  } catch {
    /* storage blocked */
  }
}
