import { useBack } from "../lib/useBack";
import { BackIcon } from "./icons";

/** Light page hero with a round back button, as on the trip, alerts and transaction pages. */
export function PageHeader({ title, back = "/", eyebrow, children }: { title: string; back?: string; eyebrow?: string; children?: React.ReactNode }) {
  const goBack = useBack(back);
  return (
    <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1 text-ink">
      <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-card text-ink active:scale-95 transition-transform">
        <BackIcon />
      </button>
      {eyebrow && <p className="mt-4 text-[12px] font-semibold tracking-[0.06em] opacity-75">{eyebrow}</p>}
      <h1 className={`${eyebrow ? "mt-1.5" : "mt-3.5"} text-[34px] font-extrabold tracking-[-0.02em]`}>{title}</h1>
      {children}
    </div>
  );
}
