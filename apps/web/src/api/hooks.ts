import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client";

export const keys = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  members: (g: string) => ["groups", g, "members"] as const,
  expenses: (g: string) => ["groups", g, "expenses"] as const,
  balances: (g: string) => ["groups", g, "balances"] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET("/api/v1/me")) });

export const useGroups = () =>
  useQuery({ queryKey: keys.groups, queryFn: () => unwrap(api.GET("/api/v1/groups")).then((r) => r.items) });

export const useMembers = (groupId?: string) =>
  useQuery({
    queryKey: keys.members(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}/members", { params: { path: { groupId: groupId! } } })).then((r) => r.items),
  });

export const useRecentExpenses = (groupId?: string, limit = 12) =>
  useQuery({
    queryKey: [...keys.expenses(groupId ?? ""), { limit }],
    enabled: Boolean(groupId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/groups/{groupId}/expenses", { params: { path: { groupId: groupId! }, query: { limit } } })),
  });

export const useBalances = (groupId?: string) =>
  useQuery({
    queryKey: keys.balances(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}/balances", { params: { path: { groupId: groupId! } } })),
  });
