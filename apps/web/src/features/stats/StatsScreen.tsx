import { formatINR } from "@lets-split/core";
import { inkOn } from "../../lib/color";
import { useGroups } from "../../api/hooks";
import { accentOf } from "../home/TripStack";

/** Shell for Trip stats + Wrapped entry. Charts arrive in Phase 3. */
export function StatsScreen() {
  const groups = useGroups();
  const trip = groups.data?.[0];
  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-[22px]" style={{ background: trip ? accentOf(trip, 0) : "#E5E6EA", color: trip ? inkOn(trip.accent) : undefined }}>
        <p className="text-[12px] font-semibold tracking-[0.06em] opacity-75">TRIP STATS</p>
        <h1 className="mt-1.5 text-[34px] font-extrabold tracking-[-0.02em]">{trip?.name ?? "No trip yet"}</h1>
        <div className="mt-4 flex gap-2.5">
          <div className="flex-1 rounded-[18px] bg-white/45 p-3">
            <span className="block text-[11px] font-semibold opacity-70">TOTAL SPENT</span>
            <b className="text-[20px] font-bold">{formatINR(trip?.totalSpentPaise ?? 0, { decimals: "never" })}</b>
          </div>
          <div className="flex-1 rounded-[18px] bg-white/45 p-3">
            <span className="block text-[11px] font-semibold opacity-70">PEOPLE</span>
            <b className="text-[20px] font-bold">{trip?.memberCount ?? 0}</b>
          </div>
        </div>
      </div>
      <div className="relative mx-[18px] mt-3.5 overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#FF2E93,#E8221B_45%,#3A0418)] p-5 text-white">
        <b className="block text-[24px] font-extrabold">{(trip?.name ?? "Trip").split(" ")[0]} Wrapped</b>
        <span className="text-[13px] opacity-85">Unlocks when your trip has a few expenses</span>
      </div>
      <div className="mx-[18px] mt-3 rounded-[var(--radius-card)] bg-card px-4 py-6 text-center text-[14px] text-muted">
        Daily spend, categories and who paid most arrive in a later build.
      </div>
    </div>
  );
}
