import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import type { Group, Member } from "../../api/client";
import { useWrite, withKey } from "../../api/mutations";
import { Avatar } from "../../ui/Avatar";
import { CopyIcon, ShareIcon, UserPlusIcon } from "../../ui/icons";
import { listItem, snappy } from "../../ui/motion";
import { Qr } from "../../ui/Qr";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { fieldCls } from "./TripFormSheet";

export const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

/** Invite by link or QR, add placeholders for people who haven't joined, and reset the link. */
export function InviteSheet({ open, onClose, group, members }: { open: boolean; onClose: () => void; group: Group; members: Member[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Invite to ${group.name}`}>
      <InviteBody group={group} members={members} />
    </Sheet>
  );
}

function InviteBody({ group, members }: { group: Group; members: Member[] }) {
  const toast = useToast();
  const rotate = useWrite("rotateInvite");
  const add = useWrite("addMember");
  const [name, setName] = useState("");
  const url = inviteUrl(group.inviteCode);
  const active = members.filter((m) => !m.removedAt);

  async function share() {
    const text = `Join ${group.name} on Let's Split so we can split the trip: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: group.name, text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Invite link copied");
      }
    } catch {
      /* dismissed */
    }
  }

  function addPlaceholder(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    add.mutate(withKey({ groupId: group.id, displayName: n }), { onError: (err) => toast(err.message) });
    setName("");
    toast(`${n} added. They can claim their spot from the link.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-card px-4 pt-5 pb-4">
        <div className="rounded-[18px] p-2.5" style={{ background: group.accent ?? "#F4D23C" }}>
          <div className="rounded-[12px] bg-white p-1.5">
            <Qr value={url} size={176} />
          </div>
        </div>
        <p className="mt-3 text-center text-[13px] text-muted">Friends scan this, or open the link, to join.</p>
        <p className="mt-1 max-w-full truncate font-mono text-[12px] text-ink/70">{url.replace(/^https?:\/\//, "")}</p>
        <div className="mt-3 flex w-full gap-2">
          <motion.button type="button" whileTap={{ scale: 0.96 }} transition={snappy} onClick={share} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-semibold text-white">
            <ShareIcon /> Share link
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={snappy}
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              toast("Invite link copied");
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-sheet px-4 text-[14px] font-semibold"
          >
            <CopyIcon /> Copy
          </motion.button>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] bg-card px-4 py-3">
        <h3 className="text-[12px] font-semibold tracking-[0.06em] text-muted">PEOPLE · {active.length}</h3>
        <div className="mt-1">
          {active.map((m, i) => (
            <motion.div key={m.id} {...listItem(i)} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
              <Avatar seed={m.id} avatarKey={m.avatarKey} size={34} />
              <span className="flex-1 truncate text-[14px] font-semibold">{m.isMe ? `${m.displayName} (you)` : m.displayName}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.isPlaceholder ? "bg-[#FFF4D6] text-[#8A6A00]" : "bg-[#E2F6EC] text-[#1B6B4A]"}`}>
                {m.isPlaceholder ? "Not joined" : m.role === "owner" ? "Owner" : "Joined"}
              </span>
            </motion.div>
          ))}
        </div>
        <form onSubmit={addPlaceholder} className="mt-2 flex gap-2">
          <input className={`${fieldCls} h-12 flex-1 bg-sheet ring-0`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Add someone by name" aria-label="Name of someone to add" />
          <motion.button type="submit" whileTap={{ scale: 0.94 }} transition={snappy} disabled={!name.trim()} aria-label="Add person" className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white disabled:opacity-30">
            <UserPlusIcon />
          </motion.button>
        </form>
        <p className="mt-2 px-1 text-[12px] leading-[1.45] text-muted">Add cousins who aren't on the app yet. You can split with them now; they claim their spot, with its history, when they join.</p>
      </div>

      <button
        type="button"
        onClick={() =>
          rotate.mutate(withKey({ groupId: group.id }), {
            onSuccess: () => toast("New link made. The old one no longer works."),
            onError: (e) => toast(e.message),
          })
        }
        className="h-11 text-[13.5px] font-semibold text-muted"
      >
        {rotate.isPending ? "Resetting…" : "Reset invite link"}
      </button>
    </div>
  );
}
