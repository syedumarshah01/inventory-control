"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, Card, EmptyRow, Input, Select, Td, Th, apiFetch, tableCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { fmtM } from "@/lib/dates";
import type { AppSettings } from "@/lib/settings";

interface Team {
  id: number;
  name: string;
  active: number;
}
interface Holdings {
  fiber: { id: number; code: string; length_m: number; drum_code: string }[];
  routers: { id: number; serial_number: string; model: string | null }[];
}
type FiberOutcome = "RETURNED" | "SCRAP" | "KEPT";
type RouterOutcome = "INSTALLED" | "RETURNED" | "FAULTY" | "KEPT";

export function ReturnClient({
  teams,
  settings,
  today,
  initialTeamId,
}: {
  teams: Team[];
  settings: AppSettings;
  today: string;
  initialTeamId?: number;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState(today);
  const [teamId, setTeamId] = useState<number | "">(initialTeamId ?? "");
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [fiberState, setFiberState] = useState<Record<number, { outcome: FiberOutcome; remaining: string }>>({});
  const [routerState, setRouterState] = useState<Record<number, { outcome: RouterOutcome; customerId: string }>>({});
  const [connections, setConnections] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";

  useEffect(() => {
    if (!teamId) {
      setHoldings(null);
      return;
    }
    setError("");
    setDone("");
    apiFetch(`/api/holdings?teamId=${teamId}`)
      .then((h: Holdings) => {
        setHoldings(h);
        setFiberState(Object.fromEntries(h.fiber.map((f) => [f.id, { outcome: "KEPT", remaining: "" }])));
        setRouterState(Object.fromEntries(h.routers.map((r) => [r.id, { outcome: "KEPT", customerId: "" }])));
      })
      .catch((e) => toast.show((e as Error).message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const rows = useMemo(
    () =>
      (holdings?.fiber ?? []).map((f) => {
        const st = fiberState[f.id] ?? { outcome: "KEPT" as FiberOutcome, remaining: "" };
        const rem = st.remaining === "" ? 0 : parseFloat(st.remaining);
        const remOk = Number.isFinite(rem) && rem >= 0 && rem <= f.length_m;
        const used = st.outcome === "KEPT" ? null : remOk ? round3(f.length_m - rem) : null;
        const suggestScrap = st.outcome === "RETURNED" && remOk && rem > 0 && rem < settings.scrapThresholdM;
        return { f, st, rem, remOk, used, suggestScrap };
      }),
    [holdings, fiberState, settings.scrapThresholdM]
  );

  const totals = useMemo(() => {
    let issuedM = 0,
      usedM = 0,
      returnedM = 0;
    for (const r of rows) {
      if (r.st.outcome === "KEPT") continue;
      issuedM += r.f.length_m;
      usedM += round3(r.f.length_m - r.rem);
      returnedM += round3(r.rem);
    }
    const t = { issued: 0, installed: 0, returned: 0, faulty: 0, kept: 0 };
    for (const r of holdings?.routers ?? []) {
      const st = routerState[r.id]?.outcome ?? "KEPT";
      if (st === "KEPT") t.kept += 1;
      else {
        t.issued += 1;
        if (st === "INSTALLED") t.installed += 1;
        if (st === "RETURNED") t.returned += 1;
        if (st === "FAULTY") t.faulty += 1;
      }
    }
    return { cable: { issuedM: round3(issuedM), usedM: round3(usedM), returnedM: round3(returnedM) }, routers: t };
  }, [rows, holdings, routerState]);

  async function save() {
    for (const r of rows) {
      if (r.st.outcome === "KEPT") continue;
      if (!r.remOk) {
        return setError(`Remaining meters for ${r.f.code} must be between 0 and ${fmtM(r.f.length_m)}.`);
      }
    }
    for (const r of holdings?.routers ?? []) {
      const st = routerState[r.id];
      if (st?.outcome === "INSTALLED" && !st.customerId.trim()) {
        return setError(`Customer ID needed to install ${r.serial_number}.`);
      }
    }
    setError("");
    const ok = await confirm({
      title: `Close out ${teamName}?`,
      message: `Cable: ${fmtM(totals.cable.usedM)} m used, ${fmtM(totals.cable.returnedM)} m back. Routers: ${totals.routers.installed} installed, ${totals.routers.returned} returned, ${totals.routers.faulty} faulty, ${totals.routers.kept} still out.`,
      confirmLabel: "Save",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/return/day", {
        method: "POST",
        body: JSON.stringify({
          teamId,
          date,
          fiber: rows
            .filter((r) => r.st.outcome !== "KEPT")
            .map((r) => ({ pieceId: r.f.id, outcome: r.st.outcome, remainingM: r.remOk ? r.rem : 0 })),
          routers: (holdings?.routers ?? []).map((r) => ({
            routerId: r.id,
            outcome: routerState[r.id]?.outcome ?? "KEPT",
            customerId: routerState[r.id]?.customerId ?? null,
          })),
          connections: connections === "" ? null : Number(connections),
        }),
      });
      const names = (res.summary.remainders ?? [])
        .filter((x: { scrapped: boolean }) => !x.scrapped)
        .map((x: { code: string; lengthM: number }) => `${x.code} (${fmtM(x.lengthM)} m)`);
      setDone(
        `Saved. Used ${fmtM(res.summary.cable.usedM)} m` +
          (names.length ? ` — back in pool: ${names.join(", ")}` : "") +
          `. ${res.summary.routers.installed} installed, ${res.summary.routers.returned} returned, ${res.summary.routers.faulty} faulty, ${res.summary.routers.kept} still out.`
      );
      toast.show("Saved.", "success");
      const h = await apiFetch(`/api/holdings?teamId=${teamId}`);
      setHoldings(h);
      setFiberState(Object.fromEntries(h.fiber.map((f: Holdings["fiber"][0]) => [f.id, { outcome: "KEPT", remaining: "" }])));
      setRouterState(Object.fromEntries(h.routers.map((r: Holdings["routers"][0]) => [r.id, { outcome: "KEPT", customerId: "" }])));
      setConnections("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Return</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1 block text-xs text-gray-500">Team</span>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")} className="w-44">
            <option value="">— team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1 block text-xs text-gray-500">Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <span className="mb-1 block text-xs text-gray-500">Connections today</span>
          <Input
            type="number"
            min={0}
            step={1}
            value={connections}
            onChange={(e) => setConnections(e.target.value)}
            placeholder="optional"
            className="w-32"
          />
        </div>
      </div>

      {!teamId && <p className="text-sm text-gray-400">Pick a team to see what they hold.</p>}

      {teamId && holdings && (
        <>
          <Card title={`Fiber (${holdings.fiber.length})`}>
            {holdings.fiber.length === 0 ? (
              <EmptyRow cols={1} message="Nothing out." />
            ) : (
              <table className={tableCls}>
                <thead>
                  <tr>
                    <Th>Piece</Th>
                    <Th className="text-right">Issued</Th>
                    <Th>Outcome</Th>
                    <Th>Remaining (m)</Th>
                    <Th className="text-right">Used</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ f, st, remOk, used, suggestScrap }) => (
                    <tr key={f.id}>
                      <Td className="font-medium">{f.code}</Td>
                      <Td className="text-right tabular-nums">{fmtM(f.length_m)} m</Td>
                      <Td>
                        <div className="flex gap-1">
                          <Toggle on={st.outcome !== "KEPT"} onClick={() => setFiberState((s) => ({ ...s, [f.id]: { ...s[f.id], outcome: "RETURNED" } }))}>
                            Back
                          </Toggle>
                          <Toggle on={st.outcome === "KEPT"} onClick={() => setFiberState((s) => ({ ...s, [f.id]: { ...s[f.id], outcome: "KEPT" } }))}>
                            With team
                          </Toggle>
                        </div>
                      </Td>
                      <Td>
                        {st.outcome === "KEPT" ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              max={f.length_m}
                              step="any"
                              value={st.remaining}
                              onChange={(e) => setFiberState((s) => ({ ...s, [f.id]: { ...s[f.id], remaining: e.target.value } }))}
                              placeholder={`0–${fmtM(f.length_m)}`}
                              className="w-24"
                            />
                            {suggestScrap && (
                              <Toggle
                                on={st.outcome === "SCRAP"}
                                onClick={() => setFiberState((s) => ({ ...s, [f.id]: { ...s[f.id], outcome: "SCRAP" } }))}
                              >
                                scrap?
                              </Toggle>
                            )}
                            {st.outcome === "SCRAP" && <span className="text-xs text-red-600">remainder scrapped</span>}
                            {!remOk && st.remaining !== "" && <span className="text-xs text-red-600">invalid</span>}
                          </div>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{used !== null ? `${fmtM(used)} m` : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={`Routers (${holdings.routers.length})`}>
            {holdings.routers.length === 0 ? (
              <EmptyRow cols={1} message="Nothing out." />
            ) : (
              <table className={tableCls}>
                <thead>
                  <tr>
                    <Th>Serial</Th>
                    <Th>Outcome</Th>
                    <Th>Customer</Th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.routers.map((r) => {
                    const st = routerState[r.id] ?? { outcome: "KEPT" as RouterOutcome, customerId: "" };
                    return (
                      <tr key={r.id}>
                        <Td className="font-medium">{r.serial_number}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {(
                              [
                                ["INSTALLED", "Installed"],
                                ["RETURNED", "Back"],
                                ["FAULTY", "Faulty"],
                                ["KEPT", "With team"],
                              ] as const
                            ).map(([v, label]) => (
                              <Toggle
                                key={v}
                                on={st.outcome === v}
                                onClick={() => setRouterState((s) => ({ ...s, [r.id]: { ...s[r.id], outcome: v } }))}
                              >
                                {label}
                              </Toggle>
                            ))}
                          </div>
                        </Td>
                        <Td>
                          {st.outcome === "INSTALLED" ? (
                            <Input
                              value={st.customerId}
                              onChange={(e) => setRouterState((s) => ({ ...s, [r.id]: { ...s[r.id], customerId: e.target.value } }))}
                              placeholder="customer ID"
                              className="w-36"
                            />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Cable {fmtM(totals.cable.usedM)} m used · {fmtM(totals.cable.returnedM)} m back · routers{" "}
              {totals.routers.installed} installed / {totals.routers.returned} back / {totals.routers.faulty} faulty /{" "}
              {totals.routers.kept} out
            </p>
            <Btn onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Btn>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && <p className="text-sm text-emerald-700">{done}</p>}
        </>
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-8 rounded px-2 py-1 text-xs font-medium ${
        on ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
