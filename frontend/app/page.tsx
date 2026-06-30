"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTRACT_ADDRESS,
  DEMO_MODE,
  type BountyInfo,
  type Submission,
  connectWallet,
  fetchBounty,
  fetchSubmissions,
  submitWork,
  evaluateSubmission,
  fundBounty,
  reclaimBounty,
} from "@/lib/genlayer";
import {
  avatarGradient,
  genToWei,
  isZeroAddress,
  scoreColor,
  shortAddr,
  weiToGen,
} from "@/lib/format";

const EXPLORER = "https://explorer-bradbury.genlayer.com";

type ToastT = { id: number; type: "success" | "error" | "info"; msg: string };

export default function Page() {
  const [account, setAccount] = useState<string | null>(null);
  const [bounty, setBounty] = useState<BountyInfo | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastT[]>([]);

  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [fundAmount, setFundAmount] = useState("1");
  const [mounted, setMounted] = useState(false);

  const toast = useCallback((type: ToastT["type"], msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      // Sequential (not parallel) to stay under the public RPC rate limit.
      const b = await fetchBounty();
      setBounty(b);
      const s = await fetchSubmissions();
      setSubs(s);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (label: string, human: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      toast("success", `${human} confirmed`);
      await reload();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const onConnect = () =>
    run("connect", "Wallet connected", async () => setAccount(await connectWallet()));

  const isOwner =
    !!account && !!bounty && account.toLowerCase() === bounty.owner.toLowerCase();
  const cd = useCountdown(bounty?.deadline ?? 0);
  const canSubmit = !!account && !!bounty && !bounty.closed && !cd.past;

  // Render the dynamic app only after mount. SSR/first paint shows just the static
  // background, so browser extensions that inject into <body> can't cause a
  // hydration mismatch (React builds the UI client-side after this point).
  if (!mounted) {
    return (
      <>
        <div className="bg-orbs">
          <div className="orb a" />
          <div className="orb b" />
          <div className="orb c" />
        </div>
        <div className="bg-grid" />
      </>
    );
  }

  return (
    <>
      <div className="bg-orbs">
        <div className="orb a" />
        <div className="orb b" />
        <div className="orb c" />
      </div>
      <div className="bg-grid" />

      <div className="container">
        <nav className="nav">
          <div className="brand">
            <div className="brand-mark">🏆</div>
            <div>
              <div className="brand-name">BountyAI</div>
              <div className="brand-sub">Autonomous bounties on GenLayer</div>
            </div>
          </div>
          <div className="row">
            <span className="pill">
              <span className="dot" /> Bradbury · 4221
            </span>
            {account ? (
              <span className="pill">
                <span
                  className="avatar"
                  style={{ width: 18, height: 18, background: avatarGradient(account) }}
                />
                <span className="mono">{shortAddr(account)}</span>
              </span>
            ) : (
              <button className="btn btn-primary" onClick={onConnect} disabled={busy === "connect"}>
                {busy === "connect" ? <Spin label="Connecting…" /> : "Connect Wallet"}
              </button>
            )}
          </div>
        </nav>

        <header className="hero">
          <span className="pill reveal">⚖️ AI-validator consensus · live on testnet</span>
          <h1 className="reveal" style={{ animationDelay: "60ms" }}>
            Bounties that <span className="grad-text">judge themselves</span>
          </h1>
          <p className="reveal" style={{ animationDelay: "120ms" }}>
            Post a task, fund a reward, and let GenLayer&apos;s Intelligent Contract read each
            submission and score it against your criteria — no human reviewer, no oracle.
          </p>
        </header>

        {DEMO_MODE && (
          <div className="banner banner-demo">
            ✦ Demo data — set <span className="mono">NEXT_PUBLIC_CONTRACT_ADDRESS</span> to go live.
          </div>
        )}

        {loading && !bounty && <SkeletonCard />}

        {bounty && (
          <>
            <section className="card reveal">
              <div className="row between">
                <h2>{bounty.task}</h2>
                <span className={`badge ${bounty.closed ? "badge-closed" : "badge-open"}`}>
                  {bounty.closed ? "● Closed" : "● Open"}
                </span>
              </div>

              <div className="reward-row">
                <div className="reward-big">
                  <CountUp value={parseFloat(weiToGen(bounty.reward)) || 0} maxDecimals={3} />
                  <span>GEN reward</span>
                </div>
                {cd.past ? (
                  <span className="badge badge-amber">Deadline passed</span>
                ) : (
                  <div className="countdown">
                    <Cd n={cd.d} l="days" />
                    <Cd n={cd.h} l="hrs" />
                    <Cd n={cd.m} l="min" />
                    <Cd n={cd.s} l="sec" />
                  </div>
                )}
              </div>

              <h3>Evaluation criteria</h3>
              <p className="muted" style={{ margin: 0 }}>{bounty.criteria}</p>

              <div className="meta-grid">
                <Tile k="Pot balance" value={parseFloat(weiToGen(bounty.pot)) || 0} maxDecimals={3} suffix=" GEN" />
                <Tile k="Pass score" value={bounty.minScore} suffix=" / 100" />
                <Tile k="Submissions" value={subs.length} />
                <TileText k="Status" v={bounty.closed ? "Settled" : cd.past ? "Reviewing" : "Accepting"} />
              </div>

              {!isZeroAddress(bounty.winner) && (
                <div className="winner-banner">
                  🥇 Winner
                  <span className="avatar" style={{ width: 22, height: 22, background: avatarGradient(bounty.winner) }} />
                  <a className="mono" href={`${EXPLORER}/address/${bounty.winner}`} target="_blank" rel="noreferrer">
                    {shortAddr(bounty.winner)}
                  </a>
                </div>
              )}
            </section>

            <section className="card reveal" style={{ animationDelay: "80ms" }}>
              <h3 style={{ marginTop: 0 }}>How it works</h3>
              <div className="steps">
                <Step n="1" ic="📝" t="Submit work" d="Anyone posts a public link (GitHub, gist, page) before the deadline." />
                <Step n="2" ic="⚖️" t="AI evaluates" d="Validators fetch it, score against the criteria, and agree by consensus." />
                <Step n="3" ic="🏆" t="Winner paid" d="The first submission past the threshold is paid the reward automatically." />
              </div>
            </section>

            {canSubmit && (
              <section className="card reveal">
                <h2>Submit your work</h2>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Paste a public link — the AI judge fetches and scores it on chain.
                </p>
                <input className="input" placeholder="https://github.com/you/your-work" value={url} onChange={(e) => setUrl(e.target.value)} />
                <textarea className="textarea" placeholder="Short note about your submission" value={note} onChange={(e) => setNote(e.target.value)} />
                <button
                  className="btn btn-primary"
                  disabled={!url || !!busy}
                  onClick={() =>
                    run("submit", "Submission", () =>
                      submitWork(account as `0x${string}`, url, note).then(() => {
                        setUrl("");
                        setNote("");
                      }),
                    )
                  }
                >
                  {busy === "submit" ? <Spin label="Submitting…" /> : "Submit work"}
                </button>
              </section>
            )}

            <div className="section-title">
              <h2>Submissions</h2>
              {!account && <span className="muted small">connect to submit or evaluate</span>}
            </div>

            <section className="card reveal">
              {subs.length === 0 && <p className="muted">No submissions yet — be the first.</p>}
              {subs.map((s, i) => (
                <div key={s.id} className="sub" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="avatar" style={{ background: avatarGradient(s.submitter) }} />
                  <div className="sub-body">
                    <div className="row between wrap">
                      <a className="mono" href={`${EXPLORER}/address/${s.submitter}`} target="_blank" rel="noreferrer">
                        {shortAddr(s.submitter)}
                      </a>
                      {s.evaluated ? (
                        <span className={`badge ${s.score >= bounty.minScore ? "badge-open" : "badge-closed"}`}>
                          {s.score >= bounty.minScore ? "✓ passed" : "✕ below bar"} · {s.score}/100
                        </span>
                      ) : (
                        <span className="badge">pending review</span>
                      )}
                    </div>
                    <a className="small" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
                    {s.note && <p className="muted small" style={{ margin: "4px 0 0" }}>{s.note}</p>}
                    {s.evaluated && <ScoreBar score={s.score} min={bounty.minScore} />}
                    {s.evaluated && s.reasoning && <p className="reasoning">“{s.reasoning}”</p>}
                    {!s.evaluated && !bounty.closed && account && (
                      <button
                        className="btn"
                        style={{ marginTop: 12 }}
                        disabled={!!busy}
                        onClick={() => run(`eval-${s.id}`, "Evaluation", () => evaluateSubmission(account as `0x${string}`, s.id))}
                      >
                        {busy === `eval-${s.id}` ? <Spin label="AI is judging…" /> : "⚖️ Evaluate with AI"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>

            {account && !bounty.closed && (
              <section className="card reveal">
                <h2>Manage</h2>
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <input className="input narrow" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => run("fund", "Funding", () => fundBounty(account as `0x${string}`, genToWei(fundAmount)))}
                  >
                    {busy === "fund" ? <Spin label="Funding…" /> : `Add ${fundAmount} GEN to pot`}
                  </button>
                </div>
                {isOwner && cd.past && (
                  <button
                    className="btn btn-danger"
                    disabled={!!busy}
                    onClick={() => run("reclaim", "Reclaim", () => reclaimBounty(account as `0x${string}`))}
                  >
                    {busy === "reclaim" ? <Spin label="Reclaiming…" /> : "Reclaim funds (owner)"}
                  </button>
                )}
              </section>
            )}
          </>
        )}

        <footer className="foot">
          <span>
            {DEMO_MODE ? (
              "demo mode"
            ) : (
              <>
                contract{" "}
                <a className="mono" href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                  {shortAddr(CONTRACT_ADDRESS)}
                </a>
              </>
            )}
          </span>
          <div className="foot-links">
            <a href="https://testnet-faucet.genlayer.foundation" target="_blank" rel="noreferrer">Faucet</a>
            <a href={EXPLORER} target="_blank" rel="noreferrer">Explorer</a>
            <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">Docs</a>
          </div>
        </footer>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="ti">{t.type === "success" ? "✓" : t.type === "error" ? "⚠" : "ℹ"}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- small components / hooks ---------------- */

function Tile({ k, value, maxDecimals = 0, suffix = "" }: { k: string; value: number; maxDecimals?: number; suffix?: string }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">
        <CountUp value={value} maxDecimals={maxDecimals} />
        {suffix && <small>{suffix}</small>}
      </div>
    </div>
  );
}

function TileText({ k, v }: { k: string; v: string }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function Step({ n, ic, t, d }: { n: string; ic: string; t: string; d: string }) {
  return (
    <div className="step">
      <span className="step-n">{n}</span>
      <div className="step-ic">{ic}</div>
      <div className="step-t">{t}</div>
      <div className="step-d">{d}</div>
    </div>
  );
}

function Cd({ n, l }: { n: number; l: string }) {
  return (
    <div className="cd-unit">
      <div className="cd-num">{String(n).padStart(2, "0")}</div>
      <div className="cd-lab">{l}</div>
    </div>
  );
}

function ScoreBar({ score, min }: { score: number; min: number }) {
  const color = scoreColor(score, min);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="score">
      <div className="score-head">
        <span>AI score</span>
        <span>pass ≥ {min}</span>
      </div>
      <div className="track">
        <div className="fill" style={{ ["--w" as string]: `${pct}%`, background: color } as React.CSSProperties} />
        <div className="thresh" style={{ left: `${min}%` }} />
      </div>
    </div>
  );
}

function Spin({ label }: { label: string }) {
  return (
    <>
      <span className="spinner" /> {label}
    </>
  );
}

function CountUp({ value, maxDecimals = 0 }: { value: number; maxDecimals?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const from = ref.current;
    const start = performance.now();
    const dur = 850;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (value - from) * eased;
      ref.current = cur;
      setVal(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{val.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })}</>;
}

function useCountdown(deadlineUnix: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const diff = deadlineUnix * 1000 - now;
  const past = !deadlineUnix || diff <= 0;
  const s = Math.max(0, Math.floor(diff / 1000));
  return {
    past,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

function SkeletonCard() {
  return (
    <section className="card">
      <div className="skeleton" style={{ width: "55%", height: 22 }} />
      <div className="skeleton" style={{ width: "28%", height: 34, marginTop: 18 }} />
      <div className="skeleton" style={{ width: "100%", marginTop: 18 }} />
      <div className="skeleton" style={{ width: "82%", marginTop: 8 }} />
      <div className="meta-grid">
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 58 }} />
        <div className="skeleton" style={{ height: 58 }} />
      </div>
    </section>
  );
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object") {
    const a = e as { shortMessage?: string; message?: string };
    return a.shortMessage ?? a.message ?? String(e);
  }
  return String(e);
}
