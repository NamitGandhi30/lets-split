import { useCallback, useEffect, useState } from "react";
import { api, idem, unwrap } from "../api/client";
import { newId } from "./uuid";

/**
 * Lock screen notifications (Web Push). On iPhone this needs iOS 16.4+ and the app opened from
 * the Home Screen; Safari tabs never get push. Permission can only be asked from a tap.
 */
export type PushState =
  | "unsupported" // no Push API at all (old iOS, some in-app browsers)
  | "install" // iPhone Safari tab: add to Home Screen first
  | "off" // can ask
  | "on"
  | "blocked" // denied in Settings
  | "unavailable"; // server has no push keys yet

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

let configPromise: Promise<{ enabled: boolean; publicKey: string | null }> | null = null;
const config = () => (configPromise ??= unwrap(api.GET("/api/v1/push/config")).catch((e) => ((configPromise = null), Promise.reject(e))));

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.ready;
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await unwrap(api.PUT("/api/v1/push/subscription", { body: { endpoint: j.endpoint, keys: j.keys }, ...idem(newId()) }));
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? "install" : "unsupported";
  if (isIOS() && !isStandalone()) return "install";
  if (Notification.permission === "denied") return "blocked";
  try {
    const cfg = await config();
    if (!cfg.enabled) return "unavailable";
  } catch {
    /* offline: report from the device alone */
  }
  if (Notification.permission !== "granted") return "off";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Ask permission (must run inside a tap), subscribe, and tell the server. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const cfg = await config();
  if (!cfg.enabled || !cfg.publicKey) return "unavailable";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) }));
  await save(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await unwrap(api.DELETE("/api/v1/push/subscription", { body: { endpoint: sub.endpoint }, ...idem(newId()) })).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

/**
 * At launch: if notifications were allowed, make sure this phone's current subscription is on
 * the server (iOS can rotate it, and a fresh service worker after an update starts without one).
 */
export async function syncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== "granted") return;
    const cfg = await config();
    if (!cfg.enabled || !cfg.publicKey) return;
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) }));
    await save(sub);
  } catch {
    /* try again next launch */
  }
}

/** Tapping a notification while the app is open: route inside the app instead of reloading. */
export function onNotificationOpen(go: (path: string) => void): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  const handler = (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string } | null;
    if (d?.type !== "open-url" || !d.url) return;
    const u = new URL(d.url, location.origin);
    go(u.pathname + u.search);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

export function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    pushState().then((s) => live && setState(s), () => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);
  const run = useCallback(async (fn: () => Promise<PushState>): Promise<PushState> => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);
  return { state, busy, enable: () => run(enablePush), disable: () => run(disablePush) };
}
