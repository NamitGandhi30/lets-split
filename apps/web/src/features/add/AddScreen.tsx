import { Link } from "react-router";
import { BackIcon } from "../../ui/icons";

/** Shell for Add expense (amount, chips, Equal | Uneven ticket). The flow arrives in Phase 2. */
export function AddScreen() {
  return (
    <div className="h-full bg-split px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] text-ink">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-card">
          <BackIcon />
        </Link>
        <b className="text-[17px] font-semibold">New expense</b>
        <span className="w-10" />
      </div>
      <div className="mt-10 text-center">
        <p className="text-[15px] font-medium text-[#6A6F82]">What was it for?</p>
        <p className="mt-1 text-[58px] font-bold tracking-[-0.02em] text-ink/25">
          <span className="text-[26px]">₹</span>0<span className="text-[22px]">.00</span>
        </p>
      </div>
      <div className="mt-6 rounded-[28px] bg-card p-5 text-center text-[14px] leading-[1.5] text-muted">
        <div className="mx-auto mb-4 flex w-full gap-1 rounded-full bg-[#F1F3FA] p-1">
          <span className="flex-1 rounded-full bg-ink py-2 text-[13.5px] font-semibold text-white">Equal</span>
          <span className="flex-1 py-2 text-[13.5px] font-semibold text-[#6A6F82]">Uneven</span>
        </div>
        Adding expenses arrives with the next build: equal and uneven splits, presets and multiple payers.
      </div>
    </div>
  );
}
