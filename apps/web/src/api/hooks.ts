import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client";

export const keys = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (g: string) => ["groups", g] as const,
  members: (g: string) => ["groups", g, "members"] as const,
  expenses: (g: string) => ["groups", g, "expenses"] as const,
  balances: (g: string) => ["groups", g, "balances"] as const,
  settlements: (g: string) => ["groups", g, "settlements"] as const,
  expense: (e: string) => ["expense", e] as const,
  comments: (e: string) => ["expense", e, "comments"] as const,
  history: (e: string) => ["expense", e, "history"] as const,
  activity: ["activity"] as const,
  invite: (code: string) => ["invite", code] as const,
};

const path = (groupId: string) => ({ params: { path: { groupId } } });

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET("/api/v1/me")) });

export const useGroups = () =>
  useQuery({ queryKey: keys.groups, queryFn: () => unwrap(api.GET("/api/v1/groups")).then((r) => r.items) });

export const useGroup = (groupId?: string) =>
  useQuery({
    queryKey: keys.group(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}", path(groupId!))),
  });

export const useMembers = (groupId?: string) =>
  useQuery({
    queryKey: keys.members(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}/members", path(groupId!))).then((r) => r.items),
  });

export const useRecentExpenses = (groupId?: string, limit = 12) =>
  useQuery({
    queryKey: [...keys.expenses(groupId ?? ""), { limit }],
    enabled: Boolean(groupId),
    queryFn: () =>
      unwrap(api.GET("/api/v1/groups/{groupId}/expenses", { params: { path: { groupId: groupId! }, query: { limit } } })),
  });

export const useAllExpenses = (groupId?: string) =>
  useInfiniteQuery({
    queryKey: [...keys.expenses(groupId ?? ""), "all"],
    enabled: Boolean(groupId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/groups/{groupId}/expenses", {
          params: { path: { groupId: groupId! }, query: { limit: 50, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useBalances = (groupId?: string) =>
  useQuery({
    queryKey: keys.balances(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}/balances", path(groupId!))),
  });

export const useSettlements = (groupId?: string) =>
  useQuery({
    queryKey: keys.settlements(groupId ?? ""),
    enabled: Boolean(groupId),
    queryFn: () => unwrap(api.GET("/api/v1/groups/{groupId}/settlements", path(groupId!))).then((r) => r.items),
  });

const epath = (expenseId: string) => ({ params: { path: { expenseId } } });

export const useExpense = (expenseId?: string) =>
  useQuery({
    queryKey: keys.expense(expenseId ?? ""),
    enabled: Boolean(expenseId),
    queryFn: () => unwrap(api.GET("/api/v1/expenses/{expenseId}", epath(expenseId!))),
  });

export const useComments = (expenseId?: string) =>
  useQuery({
    queryKey: keys.comments(expenseId ?? ""),
    enabled: Boolean(expenseId),
    queryFn: () => unwrap(api.GET("/api/v1/expenses/{expenseId}/comments", epath(expenseId!))).then((r) => r.items),
  });

export const useHistory = (expenseId?: string) =>
  useQuery({
    queryKey: keys.history(expenseId ?? ""),
    enabled: Boolean(expenseId),
    queryFn: () => unwrap(api.GET("/api/v1/expenses/{expenseId}/history", epath(expenseId!))).then((r) => r.items),
  });

export const useActivity = () =>
  useQuery({
    queryKey: keys.activity,
    queryFn: () => unwrap(api.GET("/api/v1/activity", { params: { query: { limit: 60 } } })),
  });

export const useInvite = (code?: string) =>
  useQuery({
    queryKey: keys.invite(code ?? ""),
    enabled: Boolean(code),
    retry: false,
    queryFn: () => unwrap(api.GET("/api/v1/invites/{code}", { params: { path: { code: code! } } })),
  });
