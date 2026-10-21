"use client";

// The usher scanner (spec §9, Phase 5): PIN login, camera, admit N of a party, name
// search, and offline mode (N3, E17). Every rule lives on the server; offline the
// phone checks the approved list cached at the last sync (lib/gate-offline.ts) and
// uploads its check-ins when the signal returns, where they are checked again.

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  afterSync,
  checkOffline,
  readPassClaims,
  searchRoster,
  queuedFor,
  type PendingCheckIn,
  type RosterGuest,
  type SyncOutcome,
} from "@/lib/gate-offline";
import { formatTime } from "@/server/utils/dates";
import { Camera } from "./Camera";

const KEYS = { roster: "gate.roster", pending: "gate.pending", device: "gate.device" };
const REFRESH_MS = 60_000;

type Roster = { syncedAt: string; guests: RosterGuest[] };
type Target = { scanned: string; passVersion?: number } | { invitationId: string };
type Card =
  | { kind: "admit"; name: string; partySize: number; arrivedCount: number; remaining: number; target: Target; invitationId: string; offline: boolean }
  | { kind: "admitted"; name: string; count: number; remaining: number; offline: boolean }
  | { kind: "stop"; title: string; name?: string; detail?: string };
type Found = { invitationId: string; name: string; partySize: number; arrivedCount: number; members?: string[] };

// --- storage: a convenience only; private mode or full storage must not break scanning ---
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

class Offline extends Error {}
class SignedOut extends Error {}

/** fetch that tells "no signal / server down" (Offline) apart from "signed out" (SignedOut). */
async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Offline();
  }
  if (res.status === 401) throw new SignedOut();
  if (res.status >= 500) throw new Offline();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? "Something went wrong.");
  return data as T;
}

const time = (at: string | Date) => formatTime(new Date(at));
const ref = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Scanner() {
  const [phase, setPhase] = useState<"checking" | "login" | "ready">("checking");
  // Read once on load; nothing from storage is rendered before the first sync, so SSR matches.
  const [device, setDevice] = useState(() => load(KEYS.device, ""));
  const [roster, setRoster] = useState(() => load<Roster | null>(KEYS.roster, null));
  const [pending, setPending] = useState(() => load<PendingCheckIn[]>(KEYS.pending, []));
  const [online, setOnline] = useState(true);
  const [flagged, setFlagged] = useState(0);
  const [mode, setMode] = useState<"scan" | "search">("scan");
  // `seq` gives each result a fresh card (its own count), even for the same guest twice.
  const [shown, setShown] = useState<{ card: Card; seq: number } | null>(null);
  const card = shown?.card ?? null;
  const setCard = useCallback((c: Card | null) => setShown((s) => (c ? { card: c, seq: (s?.seq ?? 0) + 1 } : null)), []);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(pending); // updated only through updatePending, read by async sync

  const updatePending = useCallback((next: PendingCheckIn[]) => {
    pendingRef.current = next;
    setPending(next);
    save(KEYS.pending, next);
  }, []);

  /** Upload offline check-ins, then refresh the approved list. */
  const sync = useCallback(async () => {
    try {
      if (pendingRef.current.length) {
        const sent = pendingRef.current;
        const { results } = await api<{ results: SyncOutcome[] }>("/api/scan/sync", {
          entries: sent.map(({ clientRef, invitationId, passVersion, count, at }) => ({ clientRef, invitationId, passVersion, count, at })),
        });
        const done = afterSync(pendingRef.current, results);
        updatePending(done.pending);
        if (done.flagged.length) setFlagged((n) => n + done.flagged.length);
      }
      const fresh = await api<Roster>("/api/scan/roster");
      setRoster(fresh);
      save(KEYS.roster, fresh);
      setOnline(true);
      setPhase("ready");
    } catch (err) {
      if (err instanceof SignedOut) setPhase("login");
      else if (err instanceof Offline) {
        setOnline(false);
        // Offline with a list from earlier: keep scanning (E17). Without one there's nothing to check against.
        setPhase((p) => (p === "checking" ? (load<Roster | null>(KEYS.roster, null) ? "ready" : "login") : p));
      }
    }
  }, [updatePending]);

  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), REFRESH_MS);
    const back = () => void sync();
    const gone = () => setOnline(false);
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", gone);
    };
  }, [sync]);

  // Keep the screen on while scanning (where supported); ushers stand at the gate for hours.
  useEffect(() => {
    if (phase !== "ready" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const take = () => navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    void take();
    const onVisible = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [phase]);

  // --- checking a pass or a name ---

  function offlineCard(target: Target): Card {
    const list = roster?.guests ?? [];
    const claims = "scanned" in target ? readPassClaims(target.scanned) : null;
    if ("scanned" in target && !claims) return { kind: "stop", title: "Not a valid pass", detail: "This QR code isn't a gate pass for this wedding." };
    const check = checkOffline(list, pendingRef.current, claims ? { claims } : { invitationId: (target as { invitationId: string }).invitationId });
    const asOf = roster ? ` (list from ${time(roster.syncedAt)})` : "";
    if (check.result === "unknown") return { kind: "stop", title: "Not on the guest list", detail: `Not approved as of the last sync${asOf}. Ask the couple's contact to check.` };
    if (check.result === "outdated") return { kind: "stop", title: "Old pass", name: check.name, detail: "This pass was replaced. Ask for the latest pass, or find the guest by name." };
    if (check.result === "already_admitted") {
      return { kind: "stop", title: "Already checked in", name: check.guest.name, detail: `${check.arrivedCount} of ${check.guest.partySize} arrived${asOf}.` };
    }
    const t: Target = claims ? { scanned: (target as { scanned: string }).scanned, passVersion: claims.passVersion } : target;
    return { kind: "admit", name: check.guest.name, partySize: check.guest.partySize, arrivedCount: check.arrivedCount, remaining: check.remaining, target: t, invitationId: check.guest.invitationId, offline: true };
  }

  type ServerResult =
    | { result: "ok"; invitationId: string; name: string; partySize: number; arrivedCount: number; remaining: number }
    | { result: "already_admitted"; name: string; partySize: number; arrivedCount: number; lastAt: string | null; lastBy: string | null }
    | { result: "revoked" | "not_approved" | "outdated"; name: string }
    | { result: "invalid" | "expired" }
    | { result: "admitted"; name: string; arrivedCount: number; remaining: number; partySize: number }
    | { result: "duplicate" };

  function serverCard(r: ServerResult, target: Target, count = 0): Card {
    switch (r.result) {
      case "ok":
        return { kind: "admit", name: r.name, partySize: r.partySize, arrivedCount: r.arrivedCount, remaining: r.remaining, target, invitationId: r.invitationId, offline: false };
      case "admitted":
        return { kind: "admitted", name: r.name, count, remaining: r.remaining, offline: false };
      case "duplicate":
        return { kind: "admitted", name: "", count, remaining: 0, offline: false };
      case "already_admitted": // BR-15
        return {
          kind: "stop",
          title: "Already checked in",
          name: r.name,
          detail: `${r.arrivedCount} of ${r.partySize} arrived${r.lastAt ? `, last at ${time(r.lastAt)}${r.lastBy ? ` by ${r.lastBy}` : ""}` : ""}.`,
        };
      case "revoked":
        return { kind: "stop", title: "Invitation withdrawn", name: r.name, detail: "This invitation is no longer valid. Please refer the guest to the couple's contact." };
      case "not_approved":
        return { kind: "stop", title: "Not confirmed", name: r.name, detail: "This guest's attendance hasn't been confirmed. Please refer them to the couple's contact." };
      case "outdated":
        return { kind: "stop", title: "Old pass", name: r.name, detail: "This pass was replaced. Ask for the latest pass, or find the guest by name." };
      case "expired":
        return { kind: "stop", title: "Pass expired", detail: "This pass was for a wedding that has already happened." };
      case "invalid":
        return { kind: "stop", title: "Not a valid pass", detail: "This QR code isn't a gate pass for this wedding." };
    }
  }

  async function check(target: Target) {
    if (!("scanned" in target)) {
      // A name from search. Online, the search result is fresh; admitting re-checks it under a lock anyway.
      const g = online ? found.find((f) => f.invitationId === target.invitationId) : undefined;
      if (!g) return setCard(offlineCard(target));
      if (g.arrivedCount >= g.partySize) return setCard({ kind: "stop", title: "Already checked in", name: g.name, detail: `${g.arrivedCount} of ${g.partySize} arrived.` });
      return setCard({ kind: "admit", name: g.name, partySize: g.partySize, arrivedCount: g.arrivedCount, remaining: g.partySize - g.arrivedCount, target, invitationId: g.invitationId, offline: false });
    }
    setBusy(true);
    try {
      setCard(serverCard(await api<ServerResult>("/api/scan/verify", { scanned: target.scanned }), target));
      setOnline(true);
    } catch (err) {
      if (err instanceof SignedOut) setPhase("login");
      else if (err instanceof Offline) {
        setOnline(false);
        setCard(offlineCard(target));
      } else setCard({ kind: "stop", title: "Couldn't check", detail: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function admit(c: Extract<Card, { kind: "admit" }>, count: number) {
    setBusy(true);
    const clientRef = ref();
    const queueOffline = () => {
      updatePending([
        ...pendingRef.current,
        { clientRef, invitationId: c.invitationId, passVersion: "scanned" in c.target ? c.target.passVersion : undefined, count, at: new Date().toISOString(), name: c.name },
      ]);
      setCard({ kind: "admitted", name: c.name, count, remaining: c.remaining - count, offline: true });
    };
    try {
      if (c.offline) return queueOffline();
      const body = "scanned" in c.target ? { scanned: c.target.scanned, count, clientRef } : { invitationId: c.target.invitationId, count, clientRef };
      const r = await api<ServerResult>("/api/scan/admit", body);
      setCard(r.result === "duplicate" ? { kind: "admitted", name: c.name, count, remaining: c.remaining - count, offline: false } : serverCard(r, c.target, count));
      void sync();
    } catch (err) {
      if (err instanceof SignedOut) setPhase("login");
      else if (err instanceof Offline) {
        setOnline(false);
        queueOffline(); // the server checks it again on upload; same clientRef can never apply twice
      } else setCard({ kind: "stop", title: "Couldn't admit", detail: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // --- name search (E18) ---
  const [query, setQuery] = useState("");
  const [results, setFound] = useState<Found[]>([]);
  const found = query.trim().length < 2 ? [] : results;
  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(async () => {
      try {
        if (!online) throw new Offline();
        setFound(await api<Found[]>(`/api/scan/search?q=${encodeURIComponent(query.trim())}`));
      } catch (err) {
        if (err instanceof SignedOut) return setPhase("login");
        if (err instanceof Offline) setOnline(false);
        const queued = pendingRef.current;
        setFound(searchRoster(roster?.guests ?? [], query).map((g) => ({ ...g, arrivedCount: g.arrivedCount + queuedFor(queued, g.invitationId) })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, online, roster]);

  async function signOut() {
    if (pendingRef.current.length && !window.confirm(`${pendingRef.current.length} check-in(s) haven't uploaded yet and will be lost. Sign out anyway?`)) return;
    await fetch("/api/scan/login", { method: "DELETE" }).catch(() => {});
    save(KEYS.roster, null);
    updatePending([]);
    setRoster(null);
    setCard(null);
    setPhase("login");
  }

  if (phase === "checking") return <Shell><p className="py-24 text-center text-pearl/85">Opening the scanner…</p></Shell>;

  if (phase === "login") {
    return (
      <Shell>
        <Login
          device={device}
          onDone={(name) => {
            setDevice(name);
            save(KEYS.device, name);
            setPhase("checking");
            void sync();
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <StatusBar device={device} online={online} roster={roster} pending={pending.length} flagged={flagged} onSync={() => void sync()} onSignOut={signOut} />

      {shown ? <ResultCard key={shown.seq} card={shown.card} busy={busy} onAdmit={admit} onNext={() => setCard(null)} /> : null}

      {/* Stays mounted while a result shows, so the camera doesn't restart between guests. */}
      <div hidden={!!card} className="space-y-4">
          <div role="tablist" aria-label="Check guests by" className="grid grid-cols-2 gap-2">
            {(["scan", "search"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`label min-h-12 rounded-sm border text-[0.65rem] ${mode === m ? "border-gold bg-gold text-wine-night" : "border-gold/40 text-gold"}`}
              >
                {m === "scan" ? "Scan pass" : "Find by name"}
              </button>
            ))}
          </div>

          {mode === "scan" ? (
            <div className="space-y-3">
              <Camera paused={busy || !!card} onScan={(text) => void check({ scanned: text })} />
              <p className="text-center text-sm text-pearl/85">{busy ? "Checking…" : "Fill the square with the guest's QR code."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="label text-[0.6rem] text-gold">Guest or party member name</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  className="mt-1.5 w-full rounded-sm border border-gold/40 bg-wine-night px-3 py-3 text-lg text-white placeholder:text-pearl/60 focus:border-gold focus:outline-none"
                  placeholder="At least 2 letters"
                />
              </label>
              <ul className="divide-y divide-gold/15 rounded-sm border border-gold/20">
                {found.map((g) => (
                  <li key={g.invitationId}>
                    <button type="button" className="flex min-h-14 w-full flex-col items-start px-4 py-3 text-left hover:bg-white/5" onClick={() => void check({ invitationId: g.invitationId })}>
                      <span className="text-lg text-white">{g.name}</span>
                      <span className="text-sm text-pearl/85">
                        {g.arrivedCount} of {g.partySize} arrived{g.members && g.members.length > 1 ? ` · ${g.members.slice(1).join(", ")}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {query.trim().length >= 2 && !found.length ? <li className="px-4 py-3 text-pearl/85">No approved guest by that name.</li> : null}
              </ul>
            </div>
          )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-wine-night px-4 py-5 text-pearl">
      <h1 className="text-center font-display text-3xl text-gold">Gate scanner</h1>
      {children}
    </main>
  );
}

function Login({ device, onDone }: { device: string; onDone: (device: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("device") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scan/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: String(form.get("pin") ?? ""), device: name }),
      });
      if (res.ok) return onDone(name);
      const data = await res.json().catch(() => ({}));
      const fields = (data as { details?: { fields?: { message: string }[] } }).details?.fields;
      setError(fields?.[0]?.message ?? (data as { message?: string }).message ?? "Couldn't sign in.");
    } catch {
      setError("No connection. The first sign-in needs signal; after that the scanner works offline.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1.5 w-full rounded-sm border border-gold/40 bg-wine-night px-3 py-3 text-lg text-white placeholder:text-pearl/60 focus:border-gold focus:outline-none";
  return (
    <form onSubmit={submit} className="space-y-4 pt-6">
      <p className="text-center text-pearl/85">Enter the gate PIN from the couple to open the scanner.</p>
      <label className="block">
        <span className="label text-[0.6rem] text-gold">Gate PIN</span>
        <input name="pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,8}" required className={input} />
      </label>
      <label className="block">
        <span className="label text-[0.6rem] text-gold">This phone&rsquo;s name</span>
        <input name="device" defaultValue={device} required maxLength={40} placeholder="e.g. Gate 1" className={input} />
      </label>
      {error ? <p role="alert" className="rounded-sm bg-[#7f1d1d] px-4 py-3 text-white">{error}</p> : null}
      <button type="submit" disabled={busy} className="label min-h-12 w-full rounded-sm bg-gold text-[0.7rem] text-wine-night disabled:opacity-60">
        {busy ? "Checking…" : "Open scanner"}
      </button>
    </form>
  );
}

function StatusBar(props: { device: string; online: boolean; roster: Roster | null; pending: number; flagged: number; onSync: () => void; onSignOut: () => void }) {
  const { device, online, roster, pending, flagged } = props;
  return (
    <section aria-label="Scanner status" className="space-y-2 rounded-sm border border-gold/20 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span aria-hidden className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-[#4ade80]" : "bg-[#f59e0b]"}`} />
          {online ? "Online" : "Offline: checking against the saved list"}
          {device ? ` · ${device}` : ""}
        </span>
        <button type="button" onClick={props.onSignOut} className="label min-h-11 px-2 text-[0.6rem] text-gold underline underline-offset-4">
          Sign out
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-pearl/85">
        <span>{roster ? `List synced ${time(roster.syncedAt)} · ${roster.guests.length} parties` : "No saved list yet"}</span>
        {pending ? (
          <button type="button" onClick={props.onSync} className="label min-h-11 rounded-sm border border-[#f59e0b] px-3 text-[0.6rem] text-[#fcd34d]">
            {pending} to upload · Sync now
          </button>
        ) : null}
      </div>
      {flagged ? <p className="text-[#fcd34d]">{flagged} offline check-in(s) needed attention when uploaded; the couple can see them in the activity log.</p> : null}
    </section>
  );
}

function ResultCard({ card, busy, onAdmit, onNext }: { card: Card; busy: boolean; onAdmit: (c: Extract<Card, { kind: "admit" }>, n: number) => void; onNext: () => void }) {
  const [count, setCount] = useState(card.kind === "admit" ? card.remaining : 0);
  const next = (
    <button type="button" onClick={onNext} autoFocus={card.kind !== "admit"} className="label min-h-14 w-full rounded-sm border border-white/60 text-[0.7rem] text-white">
      Scan next
    </button>
  );

  if (card.kind === "stop") {
    return (
      <section role="alert" className="space-y-4 rounded-sm bg-[#7f1d1d] p-6 text-center text-white">
        <p aria-hidden className="text-6xl leading-none">✕</p>
        <h2 className="font-display text-4xl">{card.title}</h2>
        {card.name ? <p className="text-2xl">{card.name}</p> : null}
        {card.detail ? <p className="text-lg">{card.detail}</p> : null}
        {next}
      </section>
    );
  }

  if (card.kind === "admitted") {
    return (
      <section role="status" className="space-y-4 rounded-sm bg-[#14532d] p-6 text-center text-white">
        <p aria-hidden className="text-6xl leading-none">✓</p>
        <h2 className="font-display text-4xl">{card.count === 1 ? "1 person" : `${card.count} people`} admitted</h2>
        {card.name ? <p className="text-2xl">{card.name}</p> : null}
        {card.remaining > 0 ? <p className="text-lg">{card.remaining} more of this party can enter later.</p> : null}
        {card.offline ? <p className="rounded-sm bg-black/25 px-3 py-2">Saved on this phone; it uploads when the signal is back.</p> : null}
        {next}
      </section>
    );
  }

  // BR-16: admit fewer than the full party; the rest can come later.
  return (
    <section aria-labelledby="welcome" className="space-y-5 rounded-sm bg-[#14532d] p-6 text-center text-white">
      <p aria-hidden className="text-6xl leading-none">✓</p>
      <h2 id="welcome" className="font-display text-4xl">
        Welcome, {card.name}
      </h2>
      <p className="text-xl">
        Party of {card.partySize}
        {card.arrivedCount ? ` · ${card.arrivedCount} already in` : ""}
      </p>
      {card.offline ? <p className="rounded-sm bg-black/25 px-3 py-2">Offline check against the saved list.</p> : null}
      <div className="flex items-center justify-center gap-4" role="group" aria-label="How many are entering now">
        <button type="button" aria-label="One fewer" disabled={count <= 1} onClick={() => setCount((n) => n - 1)} className="h-14 w-14 rounded-full border border-white/70 text-3xl disabled:opacity-40">
          −
        </button>
        <output aria-live="polite" className="min-w-16 text-5xl tabular-nums">
          {count}
        </output>
        <button type="button" aria-label="One more" disabled={count >= card.remaining} onClick={() => setCount((n) => n + 1)} className="h-14 w-14 rounded-full border border-white/70 text-3xl disabled:opacity-40">
          +
        </button>
      </div>
      <button type="button" disabled={busy} autoFocus onClick={() => onAdmit(card, count)} className="label min-h-14 w-full rounded-sm bg-white text-[0.75rem] text-[#14532d] disabled:opacity-60">
        {busy ? "Admitting…" : `Admit ${count} of ${card.remaining}`}
      </button>
      <button type="button" onClick={onNext} className="label min-h-12 w-full text-[0.65rem] text-white underline underline-offset-4">
        Cancel
      </button>
    </section>
  );
}
