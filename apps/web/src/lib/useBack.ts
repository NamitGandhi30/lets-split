import { useCallback } from "react";
import { useNavigate } from "react-router";

/** True when there's an in-app page to go back to (React Router keeps its index in history.state). */
export const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/**
 * Go back like a native app: pop the history entry when there is one (so the page slides out the
 * way it came), otherwise go to `fallback`, still animating as a "back".
 */
export function useBack(fallback = "/") {
  const nav = useNavigate();
  return useCallback(() => {
    if (canGoBack()) nav(-1);
    else nav(fallback, { replace: true, state: { back: true } });
  }, [nav, fallback]);
}
