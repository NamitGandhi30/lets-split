import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { supabase } from "../../lib/supabase";

type SessionState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

const Ctx = createContext<SessionState>({ status: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setState(data.session ? { status: "signed-in", session: data.session } : { status: "signed-out" }),
    );
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
      if (event === "SIGNED_OUT") qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function RequireAuth({ children }: { children: ReactNode }) {
  const s = useSession();
  const loc = useLocation();
  if (s.status === "loading") return <div className="h-full bg-chrome" />;
  if (s.status === "signed-out") return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const s = useSession();
  if (s.status === "signed-in") return <Navigate to="/" replace />;
  return <>{children}</>;
}
