import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { storedSession, supabase } from "../../lib/supabase";

type SessionState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

const Ctx = createContext<SessionState>({ status: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  // Start on the session saved on this phone. Asking Supabase first would wait for a token renewal,
  // which with no network keeps retrying for about 30 seconds behind a blank screen.
  const [state, setState] = useState<SessionState>(() => {
    const saved = storedSession();
    return saved ? { status: "signed-in", session: saved } : { status: "loading" };
  });
  const qc = useQueryClient();

  useEffect(() => {
    // Offline for more than an hour, the access token runs out and can't be renewed, so Supabase
    // reports no session. Keep the person in on the saved one (and the cached trips) until the
    // network is back; a real sign-out or a rejected session arrives as SIGNED_OUT.
    const settle = (session: Session | null, event?: AuthChangeEvent) => {
      const s = session ?? (event === "SIGNED_OUT" ? null : storedSession());
      setState(s ? { status: "signed-in", session: s } : { status: "signed-out" });
    };
    supabase.auth.getSession().then(({ data }) => settle(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      settle(session, event);
      if (event === "SIGNED_OUT") qc.clear();
    });
    // Renew right away when the network returns, rather than on the next auto-refresh tick.
    const renew = () => void supabase.auth.getSession();
    window.addEventListener("online", renew);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", renew);
    };
  }, [qc]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function RequireAuth({ children }: { children: ReactNode }) {
  const s = useSession();
  const loc = useLocation();
  if (s.status === "loading") return <div className="h-full bg-chrome" />;
  if (s.status === "signed-out") {
    // Come back here (an invite link, say) after signing in.
    if (loc.pathname !== "/") {
      try {
        sessionStorage.setItem("returnTo", loc.pathname + loc.search);
      } catch {
        /* storage blocked */
      }
    }
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const s = useSession();
  if (s.status === "signed-in") {
    let to = "/";
    try {
      to = sessionStorage.getItem("returnTo") || "/";
      sessionStorage.removeItem("returnTo");
    } catch {
      /* storage blocked */
    }
    return <Navigate to={to.startsWith("/") && !to.startsWith("//") ? to : "/"} replace />;
  }
  return <>{children}</>;
}
