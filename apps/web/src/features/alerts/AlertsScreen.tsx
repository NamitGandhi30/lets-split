import { PageHeader } from "../../ui/PageHeader";

export function AlertsScreen() {
  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <PageHeader title="Alerts" />
      <p className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">TODAY</p>
      <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-4 py-8 text-center text-[14px] leading-[1.5] text-muted">
        You're all caught up.
        <br />
        New expenses, reminders and settle-ups will land here.
      </div>
    </div>
  );
}
