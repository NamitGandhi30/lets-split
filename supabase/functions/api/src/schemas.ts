import { z } from "@hono/zod-openapi";

const MAX_PAISE = 10_000_000_000;

export const Uuid = z.uuid().openapi({ example: "3f1c2a7e-8a3b-4c55-9d0e-2b6f1a9c4e11" });
export const Paise = z
  .number()
  .int()
  .min(0)
  .max(MAX_PAISE)
  .openapi({ description: "Integer paise (₹1 = 100).", example: 428050 });
export const PositivePaise = Paise.min(1);
export const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).openapi({ example: "#F4D23C" });
export const Vpa = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/, "Not a valid UPI ID")
  .openapi({ example: "namit@okicici" });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "NOT_FOUND" }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("Error");

// ---------- me ----------
export const Me = z
  .object({
    id: Uuid,
    email: z.string().nullable(),
    displayName: z.string(),
    avatarKey: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    upiId: z.string().nullable(),
    noUpi: z.boolean(),
  })
  .openapi("Me");

export const MePatch = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    avatarKey: z.string().max(32).nullable(),
    avatarUrl: z.string().max(500).nullable(),
    upiId: Vpa.nullable(),
    noUpi: z.boolean(),
  })
  .partial()
  .strict()
  .openapi("MePatch");

// ---------- groups ----------
export const GroupType = z.enum(["trip", "home", "couple", "other"]);

export const Group = z
  .object({
    id: Uuid,
    name: z.string(),
    emoji: z.string().nullable(),
    accent: z.string().nullable(),
    type: GroupType,
    currency: z.string(),
    location: z.string().nullable(),
    startsOn: z.string().nullable(),
    endsOn: z.string().nullable(),
    simplifyDebts: z.boolean(),
    archivedAt: z.string().nullable(),
    inviteCode: z.string(),
    createdAt: z.string(),
    memberCount: z.number().int(),
    totalSpentPaise: Paise,
    myMemberId: Uuid.nullable(),
  })
  .openapi("Group");

const dateOnly = z.iso.date().openapi({ example: "2026-12-26" });

export const GroupCreate = z
  .object({
    id: Uuid.openapi({ description: "Generated on the device; replaying it returns the same group." }),
    name: z.string().trim().min(1).max(60),
    emoji: z.string().max(16).optional(),
    accent: Hex.optional(),
    type: GroupType.default("trip"),
    location: z.string().trim().max(80).optional(),
    startsOn: dateOnly.optional(),
    endsOn: dateOnly.optional(),
  })
  .strict()
  .openapi("GroupCreate");

export const GroupPatch = z
  .object({
    name: z.string().trim().min(1).max(60),
    emoji: z.string().max(16).nullable(),
    accent: Hex.nullable(),
    type: GroupType,
    location: z.string().trim().max(80).nullable(),
    startsOn: dateOnly.nullable(),
    endsOn: dateOnly.nullable(),
    simplifyDebts: z.boolean(),
  })
  .partial()
  .strict()
  .openapi("GroupPatch");

// ---------- members ----------
export const Member = z
  .object({
    id: Uuid,
    groupId: Uuid,
    userId: Uuid.nullable(),
    displayName: z.string(),
    avatarKey: z.string().nullable(),
    role: z.enum(["owner", "member"]),
    isPlaceholder: z.boolean(),
    isMe: z.boolean(),
    joinedAt: z.string().nullable(),
    removedAt: z.string().nullable(),
  })
  .openapi("Member");

export const MemberCreate = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    avatarKey: z.string().max(32).optional(),
  })
  .strict()
  .openapi("MemberCreate", { description: "Adds a placeholder member who can claim their spot later." });

export const MemberPatch = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    avatarKey: z.string().max(32).nullable(),
    removed: z.boolean(),
  })
  .partial()
  .strict()
  .openapi("MemberPatch");

// ---------- expenses ----------
const MemberAmount = z.object({ memberId: Uuid, amountPaise: Paise });

export const SplitInput = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("equal"), members: z.array(Uuid).min(1).max(100) }),
    z.object({ type: z.literal("exact"), amounts: z.array(MemberAmount).min(1).max(100) }),
    z.object({
      type: z.literal("percent"),
      percents: z.array(z.object({ memberId: Uuid, percent: z.number().min(0).max(100) })).min(1).max(100),
    }),
    z.object({
      type: z.literal("shares"),
      shares: z.array(z.object({ memberId: Uuid, weight: z.number().min(0).max(1000) })).min(1).max(100),
    }),
    z.object({
      type: z.literal("adjustment"),
      members: z.array(Uuid).min(1).max(100),
      adjustments: z
        .array(z.object({ memberId: Uuid, amountPaise: z.number().int().min(-MAX_PAISE).max(MAX_PAISE) }))
        .max(100),
    }),
  ])
  .openapi("SplitInput");

export const ExpenseCreate = z
  .object({
    id: Uuid.openapi({ description: "Generated on the device; replaying it never creates a duplicate." }),
    description: z.string().trim().min(1).max(120),
    amountPaise: PositivePaise,
    category: z.string().max(32).optional(),
    spentAt: z.iso.datetime({ offset: true }).optional(),
    notes: z.string().max(1000).optional(),
    payers: z
      .array(z.object({ memberId: Uuid, amountPaise: PositivePaise }))
      .min(1)
      .max(20)
      .optional()
      .openapi({ description: "Who paid. Defaults to the caller paying the whole amount." }),
    split: SplitInput,
  })
  .strict()
  .openapi("ExpenseCreate");

export const Expense = z
  .object({
    id: Uuid,
    groupId: Uuid,
    description: z.string(),
    category: z.string().nullable(),
    amountPaise: Paise,
    currency: z.string(),
    splitType: z.enum(["equal", "exact", "percent", "shares", "adjustment", "itemized"]),
    splitMeta: z.unknown(),
    spentAt: z.string(),
    notes: z.string().nullable(),
    createdBy: Uuid,
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
    payers: z.array(MemberAmount),
    shares: z.array(MemberAmount),
  })
  .openapi("Expense");

export const ExpensePage = z
  .object({ items: z.array(Expense), nextCursor: z.string().nullable() })
  .openapi("ExpensePage");

// ---------- balances ----------
export const Balances = z
  .object({
    groupId: Uuid,
    simplified: z.boolean(),
    totalSpentPaise: Paise,
    nets: z.array(z.object({ memberId: Uuid, netPaise: z.number().int() })),
    transfers: z.array(z.object({ from: Uuid, to: Uuid, amountPaise: PositivePaise })),
    me: z.object({ memberId: Uuid, netPaise: z.number().int() }).nullable(),
  })
  .openapi("Balances");

export const IdempotencyHeader = z.object({
  "idempotency-key": Uuid.optional().openapi({
    param: { name: "idempotency-key", in: "header" },
    description: "Optional. Replaying a key returns the first response instead of writing again.",
  }),
});
