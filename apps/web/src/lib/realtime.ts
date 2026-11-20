import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { keys } from "../api/hooks";
import { supabase } from "./supabase";

/**
 * Realtime is only a "something changed" ping: when a row lands in `activity` for one of my groups
 * (row level security filters them), refetch that group and the alerts through the REST API.
 */
export function useChangePings(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const channel = supabase
      .channel("activity-pings")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, (payload) => {
        const gid = (payload.new as { group_id?: string }).group_id;
        if (gid) pending.add(gid);
        clearTimeout(timer);
        // Coalesce bursts (an expense writes several rows) into one refetch.
        timer = setTimeout(() => {
          for (const g of pending) qc.invalidateQueries({ queryKey: keys.group(g) });
          pending.clear();
          qc.invalidateQueries({ queryKey: keys.groups, exact: true });
          qc.invalidateQueries({ queryKey: keys.activity });
        }, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
