"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Btn, Card, EmptyRow, Field, Input, Select, Td, Th, apiFetch, tableCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { fmtM } from "@/lib/dates";
import type { AppSettings } from "@/lib/settings";

interface Team {
  id: number;
  name: string;
  active: number;
}
interface HeldFiber {
  id: number;
  code: string;
  length_m: number;
  drum_code: string;
  created_at: string;
}
interface HeldRouter {
  id: number;
  serial_number: string;
  model: string | null;
}
interface Holdings {
  fiber: HeldFiber[];
  routers: HeldRouter[];
}

type FiberOutcome = "RETURNED" | "SCRAP" | "KEPT";
interface FiberState {
  outcome: FiberOutcome;
  remaining: string; // meters text; "" = not entered yet
}
type RouterOutcome = "INSTALLED" | "RETURNED" | "FAULTY" | "KEPT";
interface RouterState {
  outcome: RouterOutcome;
  customerId: string;
}

export function ReturnClient({
  teams,
  settings,
  today,
}: {
  teams: Team[];
  settings: AppSettings;
  today: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState(today);
  const [teamId, setTeamId] = useState<number | "">("");
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);
  const [fiberState, setFiberState] = useState<Record<number, FiberState>>({});
  const [routerState, setRouterState] = useState<Record<number, RouterState>>({});
  const [connections, setConnections] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<{
    cable: { issuedM: number; usedM: number; returnedM: number };
    routers: { issued: number; installed: number; returned: number; faulty: number; kept: number };
    remainders: { code: string; lengthM: number; scrapped: boolean }[];
  } | null>(null);

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";

  useEffect(() => {
    if (!teamId) {
      setHoldings(null);
      return;
    }
    setLoading(true);
    setResult(null);
    apiFetch(`/api/holdings?teamId=${teamId}`)
      .then((h: Holdings) => {
        setHoldings(h);
        const fs: Record<number, FiberState> = {};
        for (const f of h.fiber) fs[f.id] = { outcome: "KEPT", remaining: "" };
        setFiberState(fs);
        const rs: Record<number, RouterState> = {};
        for (const r of h.routers) rs[r.id] = { outcome: "KEPT", customerId: "" };
        setRouterState(rs);
      })
      .catch((e) => toast.show((e as Error).message, "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  function setFiber(id: number, patch: Partial<FiberState>) {
    setFiberState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }
  function setRouter(id: number, patch: Partial<RouterState>) {
    setRouterState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  /** Per-piece computed numbers + scrap suggestion. */
  const fiberRows = useMemo(() => {
    return (holdings?.fiber ?? []).map((f) => {
      const st = fiberState[f.id] ?? { outcome: "KEPT" as FiberOutcome, remaining: "" };
      const remaining = st.remaining === "" ? null : parseFloat(st.remaining);
      const remainingOk =
        remaining !== null && Number.isFinite(remaining) && remaining >= 0 && remaining <= f.length_m;
      const used = st.outcome === "KEPT" ? null : remainingOk ? round3(f.length_m - remaining!) : null;
      const belowScrap =
        st.outcome === "RETURNED" && remainingOk && remaining! > 0 && remaining! < settings.scrapThresholdM;
      return { f, st, remaining, remainingOk, used, belowScrap };
    });
  }, [holdings, fiberState, settings.scrapThresholdM]);

  const totals = useMemo(() => {
    let issuedM = 0;
    let usedM = 0;
    let returnedM = 0;
    for (const row of fiberRows) {
      if (row.st.outcome === "KEPT") continue;
      issuedM += row.f.length_m;
      const rem = row.st.outcome === "SCRAP" ? row.remaining ?? 0 : row.remainingOk ? row.remaining! : 0;
      usedM += round3(row.f.length_m - rem);
      returnedM += round3(rem);
    }
    const rt = { issued: 0, installed: 0, returned: 0, faulty: 0, kept: 0 };
    for (const r of holdings?.routers ?? []) {
      const st = routerState[r.id] ?? { outcome: "KEPT" as RouterOutcome, customerId: "" };
      if (st.outcome === "KEPT") rt.kept += 1;
      else {
        rt.issued += 1;
        if (st.outcome === "INSTALLED") rt.installed += 1;
        if (st.outcome === "RETURNED") rt.returned += 1;
        if (st.outcome === "FAULTY") rt.faulty += 1;
      }
    }
    return { cable: { issuedM: round3(issuedM), usedM: round3(usedM), returnedM: round3(returnedM) }, routers: rt };
  }, [fiberRows, holdings, routerState]);

  async function save() {
    if (!teamId) return;
    for (const row of fiberRows) {
      if (row.st.outcome === "KEPT") continue;
      if (!row.remainingOk) {
        setFormError(
          row.st.remaining === ""
            ? `Enter the remaining meters for ${row.f.code} (or choose "Not returned yet").`
            : `Remaining length for ${row.f.code} must be between 0 and ${fmtM(row.f.length_m)} m.`
        );
        return;
      }
    }
    for (const r of holdings?.routers ?? []) {
      const st = routerState[r.id];
      if (st?.outcome === "INSTALLED" && !st.customerId.trim()) {
        setFormError(`Customer ID is required to mark ${r.serial_number} as installed.`);
        return;
      }
    }
    setFormError("");
    const ok = await confirm({
      title: `Close out ${teamName} for ${date}?`,
      message: `Cable: ${fmtM(totals.cable.usedM)} m used, ${fmtM(totals.cable.returnedM)} m back. Routers: ${totals.routers.installed} installed, ${totals.routers.returned} returned, ${totals.routers.faulty} faulty, ${totals.routers.kept} still with team. This saves the day's record.`,
      confirmLabel: "Save daily return",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const fiber = fiberRows
        .filter((row) => row.st.outcome !== "KEPT")
        .map((row) => ({
          pieceId: row.f.id,
          outcome: row.st.outcome,
          remainingM: row.remainingOk ? row.remaining : 0,
        }));
      const routers = (holdings?.routers ?? []).map((r) => ({
        routerId: r.id,
        outcome: routerState[r.id]?.outcome ?? "KEPT",
        customerId: routerState[r.id]?.customerId ?? null,
      }));
      const res = await apiFetch("/api/return/day", {
        method: "POST",
        body: JSON.stringify({
          teamId,
          date,
          fiber,
          routers,
          connections: connections === "" ? null : Number(connections),
        }),
      });
      setResult(res.summary);
      toast.show("Daily return saved.", "success");
      // Refresh holdings.
      const h = await apiFetch(`/api/holdings?teamId=${teamId}`);
      setHoldings(h);
      const fs: Record<number, FiberState> = {};
      for (const f of h.fiber) fs[f.id] = { outcome: "KEPT", remaining: "" };
      setFiberState(fs);
      const rs: Record<number, RouterState> = {};
      for (const r of h.routers) rs[r.id] = { outcome: "KEPT", customerId: "" };
      setRouterState(rs);
      setConnections("");
    } catch (e) {
      setFormError((e as Error).message);
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Daily Return</h1>

      <Card title="Which team is returning?">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Team">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— pick a team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Connections completed today (optional)" hint="Used for the meters-per-connection report">
            <Input
              type="number"
              min={0}
              step={1}
              value={connections}
              onChange={(e) => setConnections(e.target.value)}
              placeholder="e.g. 3"
            />
          </Field>
        </div>
      </Card>

      {!teamId && <p className="text-sm text-gray-500">Pick a team to see everything they currently hold.</p>}
      {teamId && loading && <p className="text-sm text-gray-500">Loading holdings…</p>}

      {teamId && holdings && !loading && (
        <>
          <Card title={`Fiber pieces held (${holdings.fiber.length})`}>
            {holdings.fiber.length === 0 ? (
              <EmptyRow cols={1} message="This team is not holding any fiber right now." />
            ) : (
              <div className="scroll-x overflow-x-auto">
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <Th>Piece</Th>
                      <Th className="text-right">Issued</Th>
                      <Th>Drum</Th>
                      <Th>Outcome</Th>
                      <Th>Remaining (m)</Th>
                      <Th className="text-right">Used</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiberRows.map(({ f, st, remaining, remainingOk, used, belowScrap }) => (
                      <tr key={f.id} className="align-top hover:bg-gray-50">
                        <Td className="font-medium text-gray-900">{f.code}</Td>
                        <Td className="text-right font-semibold">{fmtM(f.length_m)} m</Td>
                        <Td>{f.drum_code}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            <OutcomeBtn
                              active={st.outcome === "RETURNED"}
                              onClick={() => setFiber(f.id, { outcome: "RETURNED" })}
                            >
                              Returned
                            </OutcomeBtn>
                            <OutcomeBtn
                              active={st.outcome === "KEPT"}
                              onClick={() => setFiber(f.id, { outcome: "KEPT" })}
                            >
                              Not yet
                            </OutcomeBtn>
                          </div>
                        </Td>
                        <Td>
                          {st.outcome === "KEPT" ? (
                            <span className="text-gray-400">stays with team</span>
                          ) : (
                            <>
                              <Input
                                type="number"
                                min={0}
                                max={f.length_m}
                                step="any"
                                value={st.remaining}
                                onChange={(e) => setFiber(f.id, { remaining: e.target.value })}
                                placeholder={`0 – ${fmtM(f.length_m)}`}
                                className="w-32"
                              />
                              {st.outcome === "RETURNED" && !remainingOk && st.remaining !== "" && (
                                <p className="mt-1 text-xs font-medium text-red-600">
                                  Must be 0 – {fmtM(f.length_m)}
                                </p>
                              )}
                              {belowScrap && (
                                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                                  <p className="font-semibold">
                                    Only {fmtM(remaining!)} m left — below the {settings.scrapThresholdM} m scrap
                                    threshold.
                                  </p>
                                  <Btn
                                    variant="secondary"
                                    className="mt-1 min-h-9 px-2 py-1 text-xs"
                                    type="button"
                                    onClick={() => setFiber(f.id, { outcome: "SCRAP" })}
                                  >
                                    Mark remainder as scrap
                                  </Btn>
                                </div>
                              )}
                              {st.outcome === "SCRAP" && (
                                <p className="mt-1 text-xs font-medium text-red-600">remainder will be scrapped</p>
                              )}
                            </>
                          )}
                        </Td>
                        <Td className="text-right">{used !== null ? `${fmtM(used)} m` : "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Routers held (${holdings.routers.length})`}>
            {holdings.routers.length === 0 ? (
              <EmptyRow cols={1} message="This team is not holding any routers right now." />
            ) : (
              <div className="scroll-x overflow-x-auto">
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <Th>Serial</Th>
                      <Th>Model</Th>
                      <Th>Outcome</Th>
                      <Th>Customer ID</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.routers.map((r) => {
                      const st = routerState[r.id] ?? { outcome: "KEPT" as RouterOutcome, customerId: "" };
                      return (
                        <tr key={r.id} className="align-top hover:bg-gray-50">
                          <Td className="font-medium text-gray-900">{r.serial_number}</Td>
                          <Td>{r.model ?? "—"}</Td>
                          <Td>
                            <div className="flex flex-wrap gap-1.5">
                              <OutcomeBtn active={st.outcome === "INSTALLED"} onClick={() => setRouter(r.id, { outcome: "INSTALLED" })}>
                                Installed
                              </OutcomeBtn>
                              <OutcomeBtn active={st.outcome === "RETURNED"} onClick={() => setRouter(r.id, { outcome: "RETURNED" })}>
                                Returned
                              </OutcomeBtn>
                              <OutcomeBtn active={st.outcome === "FAULTY"} onClick={() => setRouter(r.id, { outcome: "FAULTY" })}>
                                Faulty
                              </OutcomeBtn>
                              <OutcomeBtn active={st.outcome === "KEPT"} onClick={() => setRouter(r.id, { outcome: "KEPT" })}>
                                With team
                              </OutcomeBtn>
                            </div>
                          </Td>
                          <Td>
                            {st.outcome === "INSTALLED" ? (
                              <Input
                                value={st.customerId}
                                onChange={(e) => setRouter(r.id, { customerId: e.target.value })}
                                placeholder="Customer ID (required)"
                                className="w-44"
                              />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Reconciliation — check before saving">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Cable</h3>
                <dl className="space-y-1 text-sm">
                  <Row label="Issued to team (in this close-out)" value={`${fmtM(totals.cable.issuedM)} m`} />
                  <Row label="Used" value={`${fmtM(totals.cable.usedM)} m`} />
                  <Row label="Returned to pool" value={`${fmtM(totals.cable.returnedM)} m`} />
                </dl>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Routers</h3>
                <dl className="space-y-1 text-sm">
                  <Row label="Issued to team (in this close-out)" value={String(totals.routers.issued)} />
                  <Row label="Installed" value={String(totals.routers.installed)} />
                  <Row label="Returned unused" value={String(totals.routers.returned)} />
                  <Row label="Faulty" value={String(totals.routers.faulty)} />
                  <Row label="Still with team" value={String(totals.routers.kept)} />
                </dl>
              </div>
            </div>
            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>
            )}
            <Btn onClick={save} disabled={busy} className="mt-4 w-full sm:w-auto">
              {busy ? "Saving…" : `Save daily return for ${teamName}`}
            </Btn>
            <p className="mt-2 text-xs text-gray-500">
              Saving marks the team as closed out for {date}, even if everything stays with them overnight.
            </p>
          </Card>
        </>
      )}

      {result && (
        <Card title="✅ Saved">
          <p className="text-sm text-gray-700">
            {teamName} closed out for {date}: {fmtM(result.cable.usedM)} m used, {fmtM(result.cable.returnedM)} m
            returned{result.remainders.length > 0 ? ` (new pool pieces: ${result.remainders.filter((r) => !r.scrapped).map((r) => `${r.code} ${fmtM(r.lengthM)} m`).join(", ") || "none"})` : ""}. Routers:{" "}
            {result.routers.installed} installed, {result.routers.returned} returned, {result.routers.faulty} faulty,{" "}
            {result.routers.kept} still with team.
          </p>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function OutcomeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
