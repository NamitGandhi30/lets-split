// Database rows (snake_case) -> API objects (camelCase).

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_key: string | null;
  avatar_url: string | null;
  upi_id: string | null;
  no_upi: boolean;
}

export const toMe = (p: ProfileRow, email: string | null) => ({
  id: p.id,
  email,
  displayName: p.display_name,
  avatarKey: p.avatar_key,
  avatarUrl: p.avatar_url,
  upiId: p.upi_id,
  noUpi: p.no_upi,
});

export interface MemberRow {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  avatar_key: string | null;
  role: "owner" | "member";
  joined_at: string | null;
  removed_at: string | null;
}

export const toMember = (m: MemberRow, me: string) => ({
  id: m.id,
  groupId: m.group_id,
  userId: m.user_id,
  displayName: m.display_name,
  avatarKey: m.avatar_key,
  role: m.role,
  isPlaceholder: m.user_id === null,
  isMe: m.user_id === me,
  joinedAt: m.joined_at,
  removedAt: m.removed_at,
});

export interface GroupRow {
  id: string;
  name: string;
  emoji: string | null;
  accent: string | null;
  type: "trip" | "home" | "couple" | "other";
  currency: string;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
  simplify_debts: boolean;
  archived_at: string | null;
  invite_code: string;
  created_at: string;
  group_members?: { id: string; user_id: string | null; removed_at: string | null }[];
}

export const toGroup = (g: GroupRow, me: string, totalSpentPaise: number) => {
  const active = (g.group_members ?? []).filter((m) => m.removed_at === null);
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    accent: g.accent,
    type: g.type,
    currency: g.currency.trim(),
    location: g.location,
    startsOn: g.starts_on,
    endsOn: g.ends_on,
    simplifyDebts: g.simplify_debts,
    archivedAt: g.archived_at,
    inviteCode: g.invite_code,
    createdAt: g.created_at,
    memberCount: active.length,
    totalSpentPaise,
    myMemberId: active.find((m) => m.user_id === me)?.id ?? null,
  };
};

export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  category: string | null;
  amount_paise: number;
  currency: string;
  split_type: "equal" | "exact" | "percent" | "shares" | "adjustment" | "itemized";
  split_meta: unknown;
  spent_at: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  expense_payers: { member_id: string; amount_paise: number }[];
  expense_shares: { member_id: string; amount_paise: number }[];
}

export const EXPENSE_SELECT = "*, expense_payers(member_id, amount_paise), expense_shares(member_id, amount_paise)";

export const toExpense = (e: ExpenseRow) => ({
  id: e.id,
  groupId: e.group_id,
  description: e.description,
  category: e.category,
  amountPaise: Number(e.amount_paise),
  currency: e.currency.trim(),
  splitType: e.split_type,
  splitMeta: e.split_meta,
  spentAt: e.spent_at,
  notes: e.notes,
  createdBy: e.created_by,
  createdAt: e.created_at,
  updatedAt: e.updated_at,
  deletedAt: e.deleted_at,
  payers: e.expense_payers.map((p) => ({ memberId: p.member_id, amountPaise: Number(p.amount_paise) })),
  shares: e.expense_shares.map((s) => ({ memberId: s.member_id, amountPaise: Number(s.amount_paise) })),
});
