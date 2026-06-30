<div align="center">

# 🏆 BountyAI

### Autonomous bounties, judged by AI-validator consensus on GenLayer

[![GenLayer](https://img.shields.io/badge/GenLayer-Bradbury-ff4d6d)](https://genlayer.com)
[![chainId](https://img.shields.io/badge/chainId-4221-4dd0e1)](https://docs.genlayer.com/developers/networks)
[![Intelligent Contract](https://img.shields.io/badge/intelligent%20contract-Python%20GenVM-8a63d2)](https://docs.genlayer.com/developers/intelligent-contracts/introduction)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%20%2B%20genlayer--js-22a6f2)](frontend)
[![Wallet](https://img.shields.io/badge/wallet-MetaMask-f6851b)](https://metamask.io)
[![License](https://img.shields.io/badge/license-MIT-2dd4bf)](#license)

</div>

---

## What is this

**BountyAI** turns a bounty into a self-resolving Intelligent Contract. A funder posts a
task, plain-English **evaluation criteria**, and a reward in GEN. Contributors submit a
public link to their work. On every evaluation, GenLayer validators independently fetch
the submission, score it against the criteria with an LLM, and must **agree within a
coarse band** before any on-chain state changes. The first submission to clear the
threshold is paid the full reward **automatically** — no human reviewer, no oracle.

**Deployed contract (Testnet Bradbury):** [`0x6b48AA59205f3E00cDcbDA5756Aa8F55C1B2CD2f`](https://explorer-bradbury.genlayer.com/address/0x6b48AA59205f3E00cDcbDA5756Aa8F55C1B2CD2f)

---

## Why this needs GenLayer

A deterministic VM cannot read *"does this code actually meet the spec?"* or *"is this a
high-quality submission?"*. Those judgments are subjective, yet they decide who gets paid.

GenLayer runs LLM inference **inside consensus**: multiple validators each reach the
verdict independently and agree under Optimistic Democracy, so a subjective evaluation
gets the same Byzantine-fault tolerance a deterministic chain gives to arithmetic. BountyAI
uses that to pay out qualitative work on chain, auditable and appealable.

## How it works

1. **Post & fund.** Deploy with a task, criteria, minimum score, deadline, and reward;
   `fund()` loads the GEN pot.
2. **Submit.** Contributors call `submit(url, note)` with a public link (GitHub, gist,
   page) before the deadline.
3. **Evaluate.** Anyone calls `evaluate(id)`. Inside a non-deterministic block, each
   validator fetches the link, scores it `0..100` against the criteria, and agrees within
   a band. The score and the model's reasoning are written on chain.
4. **Payout.** The first submission `≥ min_score` wins and is paid automatically. If nobody
   qualifies, the owner can `reclaim()` the pot after the deadline.

## The Intelligent Contract

`contracts/bounty.py` targets the GenVM Python runner (pinned by hash) and follows the
network's hard rules:

- **Integers only.** Scores are `u8` (0–100), money is `u256` in wei. No floats anywhere —
  calldata never carries a float.
- **Coarse-band equivalence.** The validator re-scores independently and agrees only if it
  lands on the **same pass/fail side** of the threshold **and** within **±7 points**, so
  heterogeneous validator LLMs converge instead of returning `Undetermined`.
- **Prompt-injection defense.** Fetched submission content is treated as untrusted: the
  judge is instructed to ignore any instructions embedded in it and score the work on its
  merits only.
- **Safe payout.** State is settled (`paid`/`closed`/`winner`) **before** any transfer to
  prevent re-entrancy; native GEN moves via `gl.get_contract_at(addr).emit_transfer`.
- **Low-RPC reads.** `get_info()` and `list_submissions()` return all state in two calls so
  the frontend never trips the public RPC rate limit.

Public methods: `fund` (payable), `submit`, `evaluate`, `reclaim`, `get_info`,
`list_submissions`, `get_submission`, `get_winner`, plus scalar getters.

## Frontend

`frontend/` is a **Next.js (App Router) + TypeScript** dApp using
[`genlayer-js`](https://docs.genlayer.com/api-references/genlayer-js) for chain reads/writes
and **MetaMask** for signing on Bradbury (chain 4221). Reads work with no wallet (the
Bradbury RPC is CORS-open); writes are signed by the connected wallet.

It's an animated operator dashboard: aurora background, **live deadline countdown**,
count-up stats, **animated score bars**, toast notifications, a "how it works" flow, and the
create / submit / evaluate / fund / reclaim actions. With no `NEXT_PUBLIC_CONTRACT_ADDRESS`
set it runs a fully interactive **demo mode** with sample data — no wallet or contract
needed.

## Project structure

```
.
├── contracts/
│   └── bounty.py             # GenLayer Intelligent Contract
├── tests/
│   ├── direct/               # fast in-memory tests (web + LLM mocked at the boundary)
│   └── integration/          # gltest against localnet / studionet / bradbury
├── deploy/
│   └── 001_deploy_bounty.ts  # genlayer-js deploy + fund script
├── frontend/                 # Next.js + genlayer-js + MetaMask dashboard
├── gltest.config.yaml        # test network configuration
├── requirements.txt          # contract toolchain (Python >= 3.12)
└── .env.example              # copy to .env and add your key
```

## Develop & test the contract

Requires Python 3.12+.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

genvm-lint check contracts/bounty.py     # lint + validate
pytest tests/direct/ -v                   # fast direct-mode tests
```

Direct-mode tests exercise the contract logic and stub web/LLM calls only at the test
boundary; the shipped contract contains no mocks.

## Deploy

```bash
npm install -g genlayer
genlayer network set testnet-bradbury
# create/import a deployer account and fund it at https://testnet-faucet.genlayer.foundation
genlayer deploy --contract contracts/bounty.py \
  --args "<task>" "<criteria>" 70 <deadline_unix> 1000000000000000000
```

> The contract's first line is the runner pin — `# { "Depends": "py-genlayer:<hash>" }` —
> and must be followed by a blank line so GenVM doesn't fold the following comment block
> into the runner spec.

## Run the frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local     # set NEXT_PUBLIC_CONTRACT_ADDRESS to your deployed address
npm run dev                          # http://localhost:3000
npm run build                        # production build
```

## Network

| | |
| --- | --- |
| **Network** | GenLayer Bradbury testnet |
| **Chain ID** | 4221 |
| **RPC** | https://rpc-bradbury.genlayer.com |
| **Explorer** | https://explorer-bradbury.genlayer.com |
| **Faucet** | https://testnet-faucet.genlayer.foundation |

## Security

- Integer-only math; settlement marks state terminal **before** any transfer to prevent
  re-entrancy.
- External submission content is treated as untrusted and the judge is hardened against
  prompt injection.
- The deployer private key lives only in the local keystore / `.env` (git-ignored) — never
  committed.

## License

MIT.
