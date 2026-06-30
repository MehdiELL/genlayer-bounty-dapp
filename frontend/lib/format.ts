// Pure formatting/conversion helpers (no network).

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WEI_PER_GEN = 10n ** 18n;

export function isZeroAddress(a?: string): boolean {
  return !a || a.toLowerCase() === ZERO_ADDRESS;
}

export function shortAddr(a?: string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Format a wei amount as a human GEN string, trimming trailing zeros. */
export function weiToGen(wei: bigint, maxDecimals = 4): string {
  const whole = wei / WEI_PER_GEN;
  const frac = wei % WEI_PER_GEN;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/** Parse a GEN string ("5", "1.25") into a wei bigint. */
export function genToWei(gen: string): bigint {
  const trimmed = (gen ?? "").trim();
  if (!trimmed) return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * WEI_PER_GEN + BigInt(fracPadded || "0");
}

export function formatDeadline(unixSeconds: number): { text: string; past: boolean } {
  const ms = unixSeconds * 1000;
  return { text: new Date(ms).toLocaleString(), past: Date.now() > ms };
}

/** Short human "in 3 days" / "2 hours left" / "ended" string. */
export function timeLeft(unixSeconds: number): string {
  const diff = unixSeconds * 1000 - Date.now();
  if (diff <= 0) return "ended";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const dys = Math.floor(hrs / 24);
  if (dys >= 1) return `${dys} day${dys > 1 ? "s" : ""} left`;
  if (hrs >= 1) return `${hrs} hour${hrs > 1 ? "s" : ""} left`;
  return `${Math.max(1, mins)} min left`;
}

/** Deterministic gradient for an address-based identicon avatar. */
export function avatarGradient(addr: string): string {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) {
    h ^= addr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = Math.abs(h) % 360;
  const b = (Math.abs(h >> 5) % 360 + 80) % 360;
  return `linear-gradient(135deg, hsl(${a} 75% 58%), hsl(${b} 75% 46%))`;
}

/** Color for a score relative to the passing threshold. */
export function scoreColor(score: number, min: number): string {
  if (score >= min) return "var(--green)";
  if (score >= min * 0.75) return "var(--amber)";
  return "var(--red)";
}
