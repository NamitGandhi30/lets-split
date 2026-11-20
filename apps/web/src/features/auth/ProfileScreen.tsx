import { useMe } from "../../api/hooks";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../../ui/Avatar";
import { PageHeader } from "../../ui/PageHeader";

export function ProfileScreen() {
  const me = useMe();
  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <PageHeader title="You" />
      <div className="mx-[18px] mt-4 flex items-center gap-3 rounded-[var(--radius-card)] bg-card p-4">
        <Avatar seed={me.data?.id ?? "you"} avatarKey={me.data?.avatarKey ?? "you"} photoUrl={me.data?.avatarUrl} size={52} />
        <div className="min-w-0">
          <b className="block truncate text-[17px] font-semibold">{me.data?.displayName ?? " "}</b>
          <span className="block truncate text-[13px] text-muted">{me.data?.email}</span>
        </div>
      </div>
      <div className="mx-[18px] mt-3 rounded-[var(--radius-card)] bg-card p-4 text-[14px]">
        <span className="text-muted">UPI ID</span>
        <b className="float-right font-semibold">{me.data?.upiId ?? (me.data?.noUpi ? "None" : "Not set")}</b>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="mx-[18px] mt-3 h-[52px] w-[calc(100%-36px)] rounded-full bg-card font-semibold text-neg"
      >
        Sign out
      </button>
    </div>
  );
}
