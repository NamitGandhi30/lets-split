import { assertPaise, MoneyError, paiseToRupeeString, type Paise } from "./money.ts";

/** A UPI payment request, following the NPCI `upi://pay` deep-link format. */
export interface UpiPayment {
  /** Payee VPA (UPI ID), e.g. "diya@okaxis". */
  vpa: string;
  /** Payee name shown in the UPI app. */
  name?: string;
  /** Amount in paise. Leave out to let the payer type it. */
  amount?: Paise;
  /** Transaction note, e.g. "Goa '26 · Let's Split". Trimmed to 50 characters. */
  note?: string;
  /** Our reference for the payment (settlement id). */
  ref?: string;
}

const VPA = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA.test(vpa.trim());
}

export function normalizeVpa(vpa: string): string {
  const v = vpa.trim().toLowerCase();
  if (!isValidVpa(v)) throw new MoneyError("INVALID_VPA", `not a UPI ID: "${vpa}"`);
  return v;
}

/** Strict RFC 3986 encoding; UPI apps choke on "+" for spaces and on raw "'" in some versions. */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function query(p: UpiPayment): string {
  const parts = [`pa=${normalizeVpa(p.vpa)}`]; // VPA chars are URL-safe; many apps reject "%40".
  if (p.name?.trim()) parts.push(`pn=${enc(p.name.trim())}`);
  if (p.amount !== undefined) {
    assertPaise(p.amount, "UPI amount");
    if (p.amount <= 0) throw new MoneyError("INVALID_AMOUNT", "UPI amount must be more than ₹0");
    parts.push(`am=${paiseToRupeeString(p.amount)}`);
  }
  parts.push("cu=INR");
  if (p.note?.trim()) parts.push(`tn=${enc([...p.note.trim()].slice(0, 50).join(""))}`);
  if (p.ref?.trim()) parts.push(`tr=${enc(p.ref.trim().slice(0, 35))}`);
  return parts.join("&");
}

/** Generic `upi://pay?...` link. Android shows an app chooser; also what the QR code encodes. */
export function buildUpiLink(p: UpiPayment): string {
  return `upi://pay?${query(p)}`;
}

export interface UpiAppLinks {
  /** Generic link; use on Android and inside the QR code. */
  upi: string;
  /** Google Pay on iOS. */
  gpay: string;
  phonepe: string;
  paytm: string;
  cred: string;
  bhim: string;
}

/** iOS has no app chooser for `upi://`, so each app gets its own scheme. */
export function buildUpiAppLinks(p: UpiPayment): UpiAppLinks {
  const q = query(p);
  return {
    upi: `upi://pay?${q}`,
    gpay: `gpay://upi/pay?${q}`,
    phonepe: `phonepe://pay?${q}`,
    paytm: `paytmmp://pay?${q}`,
    cred: `credpay://upi/pay?${q}`,
    bhim: `bhim://upi/pay?${q}`,
  };
}
