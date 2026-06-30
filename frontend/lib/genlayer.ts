// GenLayer integration layer for the AI Bounty Distributor.
//
// Reads go through a wallet-less client (free, no signing). Writes go through a
// client bound to the connected MetaMask account; connect() is always called
// first so the wallet is switched to Testnet Bradbury before signing.
//
// When NEXT_PUBLIC_CONTRACT_ADDRESS is unset we run in DEMO_MODE and dispatch to
// an in-memory backend so the UI is fully usable without a wallet or contract.

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type CalldataEncodable } from "genlayer-js/types";
import type { BountyInfo, Submission, Hex } from "./types";
import * as demo from "./demo";

export type { BountyInfo, Submission } from "./types";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as Hex;
export const DEMO_MODE = !CONTRACT_ADDRESS;

function toBig(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return BigInt(String(v ?? "0"));
}

let _readClient: ReturnType<typeof createClient> | null = null;
function readClient() {
  if (!_readClient) _readClient = createClient({ chain: testnetBradbury });
  return _readClient;
}

function writeClient(account: Hex) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found. Install MetaMask to continue.");
  }
  return createClient({ chain: testnetBradbury, account, provider: window.ethereum });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function read(functionName: string, args: CalldataEncodable[] = [], retries = 3): Promise<unknown> {
  try {
    return await readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args });
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    if (retries > 0 && /rate limit|429|too many/i.test(msg)) {
      await sleep(700);
      return read(functionName, args, retries - 1);
    }
    throw e;
  }
}

async function write(
  account: Hex,
  functionName: string,
  args: CalldataEncodable[] = [],
  value: bigint = 0n,
) {
  const client = writeClient(account);
  await client.connect("testnetBradbury"); // ensure correct chain before signing
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
  return hash;
}

export async function connectWallet(): Promise<Hex> {
  if (DEMO_MODE) return demo.connect();
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found. Install MetaMask to continue.");
  }
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  const account = accounts[0] as Hex;
  await writeClient(account).connect("testnetBradbury");
  return account;
}

export async function fetchBounty(): Promise<BountyInfo> {
  if (DEMO_MODE) return demo.fetchBounty();
  const info = (await read("get_info")) as Record<string, unknown>;
  return {
    owner: String(info.owner),
    task: String(info.task),
    criteria: String(info.criteria),
    minScore: Number(info.min_score),
    reward: toBig(info.reward),
    pot: toBig(info.pot),
    deadline: Number(info.deadline),
    closed: Boolean(info.closed),
    winner: String(info.winner),
  };
}

export async function fetchSubmissions(): Promise<Submission[]> {
  if (DEMO_MODE) return demo.fetchSubmissions();
  const arr = ((await read("list_submissions")) as Array<Record<string, unknown>>) ?? [];
  return arr.map((s, i) => ({
    id: i,
    submitter: String(s.submitter),
    url: String(s.url),
    note: String(s.note),
    score: Number(s.score),
    evaluated: Boolean(s.evaluated),
    reasoning: String(s.reasoning ?? ""),
  }));
}

export const submitWork = (account: Hex, url: string, note: string) =>
  DEMO_MODE ? demo.submit(account, url, note) : write(account, "submit", [url, note]);

export const evaluateSubmission = (account: Hex, id: number) =>
  DEMO_MODE ? demo.evaluate(id) : write(account, "evaluate", [id]);

export const fundBounty = (account: Hex, amountWei: bigint) =>
  DEMO_MODE ? demo.fund(amountWei) : write(account, "fund", [], amountWei);

export const reclaimBounty = (account: Hex) =>
  DEMO_MODE ? demo.reclaim() : write(account, "reclaim", []);
