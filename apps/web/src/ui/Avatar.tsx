import { DOODLE_KEYS, DOODLES, type DoodleKey } from "./doodles.generated";

/** Stable doodle for people who haven't picked one: hash their id onto the set. No letter initials anywhere. */
export function doodleFor(seed: string): DoodleKey {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DOODLE_KEYS[h % DOODLE_KEYS.length]!;
}

interface AvatarProps {
  avatarKey?: string | null;
  photoUrl?: string | null;
  seed: string;
  size?: number;
  label?: string;
  className?: string;
}

export function Avatar({ avatarKey, photoUrl, seed, size = 40, label, className = "" }: AvatarProps) {
  const style = { width: size, height: size };
  const cls = `block shrink-0 overflow-hidden rounded-full bg-[#FFF7EC] ${className}`;
  if (photoUrl) return <img src={photoUrl} alt={label ?? ""} className={`${cls} object-cover`} style={style} />;
  const key = avatarKey && avatarKey in DOODLES ? (avatarKey as DoodleKey) : doodleFor(seed);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      className={`${cls} [&>svg]:block [&>svg]:h-full [&>svg]:w-full`}
      style={style}
      // Generated from our own design asset, not user input.
      dangerouslySetInnerHTML={{ __html: DOODLES[key] }}
    />
  );
}
