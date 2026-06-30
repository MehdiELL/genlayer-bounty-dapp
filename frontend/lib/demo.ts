// In-memory demo backend. Used when NEXT_PUBLIC_CONTRACT_ADDRESS is not set, so the
// full UI renders and is interactive without a wallet or a deployed contract.
// Mimics the on-chain contract's behaviour closely (scores, threshold, payout).

import type { BountyInfo, Submission, Hex } from "./types";

const GEN = (n: number) => BigInt(Math.round(n * 1000)) * 10n ** 15n; // n GEN -> wei
const ZERO = "0x0000000000000000000000000000000000000000";

export const DEMO_ACCOUNT = "0xD3M0a11ce0000000000000000000000000000001" as Hex;

const days = (n: number) => Math.floor(Date.now() / 1000) + n * 24 * 3600;

const bounty: BountyInfo = {
  owner: DEMO_ACCOUNT,
  task:
    "Build a TypeScript `useDebounce` React hook with full unit tests and a short README.",
  criteria:
    "Correct debounce semantics (trailing edge), strict TypeScript types, ≥3 unit tests, and clear usage docs. No external dependencies.",
  minScore: 80,
  reward: GEN(50),
  pot: GEN(50),
  deadline: days(5),
  closed: false,
  winner: ZERO,
};

let submissions: Submission[] = [
  {
    id: 0,
    submitter: "0x9b1cE7a4f2D0c83B6E5a11F4D7c2b8A0e3F61D24",
    url: "https://github.com/devkaoutar/use-debounce/pull/3",
    note: "Trailing-edge debounce + 4 Vitest cases + README.",
    score: 76,
    evaluated: true,
    reasoning:
      "Solid implementation and good tests, but the README lacks a usage example and the cleanup on unmount is missing.",
  },
  {
    id: 1,
    submitter: "0x4F2a9C81b7E60D35aa1382F0c9D4e7B6a51028Ce",
    url: "https://gist.github.com/anon/abc123",
    note: "Quick version.",
    score: 58,
    evaluated: true,
    reasoning:
      "Debounce works for the basic case but has no TypeScript generics and only a single test. Does not meet the criteria.",
  },
  {
    id: 2,
    submitter: "0xC0ffee254729296a45a3885639AC7E10F9d54979",
    url: "https://github.com/sami-dev/react-use-debounce",
    note: "Full hook, typed, tested, documented. Please review.",
    score: 0,
    evaluated: false,
    reasoning: "",
  },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pseudoScore(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 62 + (Math.abs(h) % 37); // 62..98
}

const REASONS = [
  "Meets the criteria: correct trailing-edge debounce, typed generics, multiple tests, and clear docs.",
  "Good effort and mostly correct, but the test coverage is thin and the README is missing a usage example.",
  "Implementation is functional but lacks strict typing and unmount cleanup, so it falls short of the bar.",
];

export async function connect(): Promise<Hex> {
  await sleep(300);
  return DEMO_ACCOUNT;
}

export async function fetchBounty(): Promise<BountyInfo> {
  await sleep(150);
  return { ...bounty };
}

export async function fetchSubmissions(): Promise<Submission[]> {
  await sleep(150);
  return submissions.map((s) => ({ ...s }));
}

export async function submit(account: Hex, url: string, note: string): Promise<string> {
  await sleep(600);
  submissions.push({
    id: submissions.length,
    submitter: account,
    url,
    note,
    score: 0,
    evaluated: false,
    reasoning: "",
  });
  return "0xdemo_submit";
}

export async function evaluate(id: number): Promise<string> {
  await sleep(1400); // simulate the AI judging round
  const s = submissions[id];
  if (!s || s.evaluated || bounty.closed) return "0xdemo_eval";
  const score = pseudoScore(s.url + s.note);
  s.score = score;
  s.evaluated = true;
  s.reasoning =
    score >= bounty.minScore ? REASONS[0] : score >= 65 ? REASONS[1] : REASONS[2];
  if (score >= bounty.minScore && !bounty.closed) {
    bounty.closed = true;
    bounty.winner = s.submitter;
  }
  return "0xdemo_eval";
}

export async function fund(amountWei: bigint): Promise<string> {
  await sleep(600);
  bounty.pot += amountWei;
  return "0xdemo_fund";
}

export async function reclaim(): Promise<string> {
  await sleep(600);
  bounty.closed = true;
  bounty.pot = 0n;
  return "0xdemo_reclaim";
}
