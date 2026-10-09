"use client";

import { useMemo, useRef, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  EmptyRow,
  Field,
  Input,
  Select,
  Td,
  Th,
  apiFetch,
  tableCls,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { fmtM } from "@/lib/dates";
import type { PoolRow } from "@/lib/reports";
import type { AppSettings } from "@/lib/settings";

interface Team {
  id: number;
  name: string;
  active: number;
}
interface RouterRef {
  serial_number: string;
  status: string;
  team: string | null;
}
interface SelectedFiber {
  pieceId: number;
  code: string;
  pieceLength: number;
  drumCode: string;
  mode: "WHOLE" | "PARTIAL";
  issueLength: number;
}
interface SlipData {
  team: string;
  date: string;
  fiber: { code: string; fromCode: string | null; lengthM: number }[];
  routers: string[];
}

export function IssueClient({
  teams,
  pool,
  routerIndex,
  settings,
  today,
}: {
  teams: Team[];
  pool: PoolRow[];
  routerIndex: RouterRef[];
  settings: AppSettings;
  today: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState(today);
  const [teamId, setTeamId] = useState<number | "">(() => {
    const first = teams.find((t) => t.active);
    return first ? first.id : "";
  });
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<SelectedFiber[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState("");
  const [serialError, setSerialError] = useState("");
  const [poolSearch, setPoolSearch] = useState("");
  const [minLen, setMinLen] = useState("");
  const [sort, setSort] = useState<"asc" | "desc" | "code">("asc");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [slip, setSlip] = useState<SlipData | null>(null);
  const serialRef = useRef<HTMLInputElement>(null);

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";

  const visiblePool = useMemo(() => {
    const min = parseFloat(minLen);
    let rows = pool.filter((p) => {
      if (selected.some((s) => s.pieceId === p.id)) return false;
      if (!Number.isNaN(min) && p.length_m < min) return false;
      const q = poolSearch.trim().toLowerCase();
      if (q && !p.code.toLowerCase().includes(q) && !p.drum_code.toLowerCase().includes(q)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) =>
      sort === "asc" ? a.length_m - b.length_m : sort === "desc" ? b.length_m - a.length_m : a.code.localeCompare(b.code)
    );
    return rows;
  }, [pool, selected, poolSearch, minLen, sort]);

  function addWhole(p: PoolRow) {
    setSelected((s) => [
      ...s,
      { pieceId: p.id, code: p.code, pieceLength: p.length_m, drumCode: p.drum_code, mode: "WHOLE", issueLength: p.length_m },
    ]);
  }

  function addPartial(p: PoolRow, lengthText: string) {
    const n = parseFloat(lengthText);
    if (!Number.isFinite(n) || n <= 0) {
      toast.show("Enter a length greater than 0 meters.", "error");
      return;
    }
    if (n > p.length_m) {
      toast.show(`Cannot issue ${fmtM(n)} m — ${p.code} only holds ${fmtM(p.length_m)} m.`, "error");
      return;
    }
    setSelected((s) => [
      ...s,
      {
        pieceId: p.id,
        code: p.code,
        pieceLength: p.length_m,
        drumCode: p.drum_code,
        mode: n >= p.length_m ? "WHOLE" : "PARTIAL",
        issueLength: n,
      },
    ]);
    toast.show(`Added ${fmtM(n)} m from ${p.code}.`, "success");
  }

  function updateSelectedLength(pieceId: number, lengthText: string) {
    setSelected((s) =>
      s.map((x) => {
        if (x.pieceId !== pieceId) return x;
        const n = parseFloat(lengthText);
        if (!Number.isFinite(n) || n <= 0) return x;
        if (n > x.pieceLength) return x;
        return { ...x, issueLength: n, mode: n >= x.pieceLength ? "WHOLE" : "PARTIAL" };
      })
    );
  }

  function removeSelected(pieceId: number) {
    setSelected((s) => s.filter((x) => x.pieceId !== pieceId));
  }

  const routerMap = useMemo(() => {
    const m = new Map<string, RouterRef>();
    for (const r of routerIndex) m.set(r.serial_number.toUpperCase(), r);
    return m;
  }, [routerIndex]);

  function describeProblem(serial: string): string | null {
    const r = routerMap.get(serial.toUpperCase());
    if (!r) return `${serial} is not in inventory — add it in Receive Stock first.`;
    if (r.status === "ISSUED") return `${serial} is already issued to ${r.team ?? "a team"}.`;
    if (r.status === "INSTALLED") return `${serial} is already installed.`;
    if (r.status === "FAULTY") return `${serial} is marked FAULTY.`;
    if (r.status === "RETURNED_TO_SUPPLIER") return `${serial} was returned to the supplier.`;
    return null;
  }

  function addSerialsFromText(text: string) {
    const parts = text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const problems: string[] = [];
    const toAdd: string[] = [];
    for (const p of parts) {
      if (serials.includes(p) || toAdd.includes(p)) {
        problems.push(`${p} is already in this handover list.`);
        continue;
      }
      const problem = describeProblem(p);
      if (problem) {
        problems.push(problem);
        continue;
      }
      toAdd.push(p);
    }
    if (toAdd.length > 0) {
      setSerials((s) => [...s, ...toAdd]);
      toast.show(`Added ${toAdd.length} router${toAdd.length > 1 ? "s" : ""}.`, "success");
    }
    setSerialError(problems.join(" "));
    setSerialInput("");
    serialRef.current?.focus();
  }

  function removeSerial(sn: string) {
    setSerials((s) => s.filter((x) => x !== sn));
  }

  const fiberTotal = selected.reduce((t, s) => t + s.issueLength, 0);

  async function confirmIssue() {
    if (!teamId) {
      setFormError("Pick a team first.");
      return;
    }
    if (selected.length === 0 && serials.length === 0) {
      setFormError("Add at least one fiber piece or router.");
      return;
    }
    setFormError("");
    const ok = await confirm({
      title: "Confirm daily issue",
      message: `Give ${selected.length} fiber item(s) (${fmtM(fiberTotal)} m) and ${serials.length} router(s) to ${teamName} on ${date}?`,
      confirmLabel: "Yes, issue now",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const fiber = selected.map((s) => ({
        pieceId: s.pieceId,
        mode: s.mode === "PARTIAL" && s.issueLength < s.pieceLength ? "PARTIAL" : "WHOLE",
        lengthM: s.issueLength,
      }));
      const result = await apiFetch("/api/issue/day", {
        method: "POST",
        body: JSON.stringify({ teamId, date, notes, fiber, routerSerials: serials }),
      });
      setSlip({
        team: teamName,
        date,
        fiber: (result.fiber?.issued ?? []).map(
          (f: { code: string; fromCode: string | null; lengthM: number }) => ({
            code: f.code,
            fromCode: f.fromCode,
            lengthM: f.lengthM,
          })
        ),
        routers: serials,
      });
      toast.show("Issue recorded. Handover slip ready.", "success");
      setSelected([]);
      setSerials([]);
      setNotes("");
    } catch (e) {
      setFormError((e as Error).message);
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (slip) {
    return <HandoverSlip slip={slip} onDone={() => setSlip(null)} />;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Daily Issue</h1>

      <Card title="1 · Date & team">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Team">
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— pick a team —</option>
              {teams
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. new connection street 4" />
          </Field>
        </div>
      </Card>

      <Card title="2 · Fiber — pick from the stock pool">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Input placeholder="Search code or drum…" value={poolSearch} onChange={(e) => setPoolSearch(e.target.value)} />
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Min length (m)"
            value={minLen}
            onChange={(e) => setMinLen(e.target.value)}
          />
          <Select value={sort} onChange={(e) => setSort(e.target.value as "asc" | "desc" | "code")}>
            <option value="asc">Sort: smallest first (recommended)</option>
            <option value="desc">Sort: longest first</option>
            <option value="code">Sort: by code</option>
          </Select>
        </div>
        <div className="scroll-x max-h-96 overflow-auto rounded-lg border border-gray-200">
          <table className={tableCls}>
            <thead className="sticky top-0">
              <tr>
                <Th>Code</Th>
                <Th className="text-right">Length</Th>
                <Th>Drum</Th>
                <Th className="text-right">Age</Th>
                <Th className="w-64">Issue</Th>
              </tr>
            </thead>
            <tbody>
              {visiblePool.length === 0 && (
                <EmptyRow cols={5} message="No pieces match — adjust the filters, or receive a new drum." />
              )}
              {visiblePool.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <Td className="font-medium text-gray-900">{p.code}</Td>
                  <Td className="text-right font-semibold">{fmtM(p.length_m)} m</Td>
                  <Td>{p.drum_code}</Td>
                  <Td className="text-right text-gray-500">{p.age_days} d</Td>
                  <Td>
                    <PartialAddRow p={p} onAddWhole={() => addWhole(p)} onAddPartial={(v) => addPartial(p, v)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Pieces are sorted smallest-first so leftovers get used before opening new drums.
        </p>
      </Card>

      <Card title="3 · Routers — type or paste serials">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Input
              ref={serialRef}
              value={serialInput}
              onChange={(e) => {
                setSerialInput(e.target.value);
                setSerialError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSerialsFromText(serialInput);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (/[\s,;]/.test(text.trim())) {
                  e.preventDefault();
                  addSerialsFromText(text);
                }
              }}
              placeholder="Type a serial and press Enter (paste many at once works too)"
              list="serial-suggestions"
              autoComplete="off"
            />
            <datalist id="serial-suggestions">
              {routerIndex
                .filter((r) => r.status === "IN_STOCK")
                .slice(0, 200)
                .map((r) => (
                  <option key={r.serial_number} value={r.serial_number} />
                ))}
            </datalist>
          </div>
          <Btn variant="secondary" type="button" onClick={() => addSerialsFromText(serialInput)}>
            Add
          </Btn>
        </div>
        {serialError && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{serialError}</p>
        )}
        {serials.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {serials.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSerial(s)}
                  className="text-blue-500 hover:text-red-600"
                  aria-label={`Remove ${s}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="4 · Review & confirm">
        {formError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Fiber ({selected.length}) — total {fmtM(fiberTotal)} m
            </h3>
            {selected.length === 0 ? (
              <p className="text-sm text-gray-500">No fiber selected yet.</p>
            ) : (
              <ul className="space-y-2">
                {selected.map((s) => (
                  <li key={s.pieceId} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2">
                    <span className="font-medium text-gray-900">{s.code}</span>
                    <span className="text-xs text-gray-500">of {s.drumCode}</span>
                    {s.mode === "PARTIAL" && s.issueLength < s.pieceLength ? (
                      <>
                        <Input
                          type="number"
                          min={0.1}
                          max={s.pieceLength}
                          step="any"
                          value={s.issueLength}
                          onChange={(e) => updateSelectedLength(s.pieceId, e.target.value)}
                          className="w-24"
                        />
                        <span className="text-xs text-gray-500">of {fmtM(s.pieceLength)} m (cuts the piece)</span>
                      </>
                    ) : (
                      <Badge status="ISSUED">whole piece · {fmtM(s.pieceLength)} m</Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => removeSelected(s.pieceId)}
                      className="ml-auto text-sm font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Routers ({serials.length})</h3>
            {serials.length === 0 ? (
              <p className="text-sm text-gray-500">No routers selected yet.</p>
            ) : (
              <ul className="space-y-1">
                {serials.map((s) => (
                  <li key={s} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
                    <span className="font-medium">{s}</span>
                    <button type="button" onClick={() => removeSerial(s)} className="text-red-600 hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5">
          <Btn onClick={confirmIssue} disabled={busy} className="w-full sm:w-auto">
            {busy ? "Saving…" : `Confirm issue to ${teamName || "team"}`}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function PartialAddRow({
  p,
  onAddWhole,
  onAddPartial,
}: {
  p: PoolRow;
  onAddWhole: () => void;
  onAddPartial: (v: string) => void;
}) {
  const [len, setLen] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn variant="secondary" className="min-h-10 px-3 py-1.5 text-sm" type="button" onClick={onAddWhole}>
        Add whole
      </Btn>
      <Input
        type="number"
        min={0.1}
        max={p.length_m}
        step="any"
        placeholder="m"
        value={len}
        onChange={(e) => setLen(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAddPartial(len);
            setLen("");
          }
        }}
        className="w-20"
      />
      <Btn
        variant="ghost"
        className="min-h-10 px-2 py-1.5 text-sm"
        type="button"
        onClick={() => {
          onAddPartial(len);
          setLen("");
        }}
      >
        Cut & add
      </Btn>
    </div>
  );
}

function HandoverSlip({ slip, onDone }: { slip: SlipData; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap gap-2">
        <Btn onClick={() => window.print()}>🖨 Print slip</Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            const lines = [
              `HANDOVER SLIP — ${slip.date} — ${slip.team}`,
              "",
              "FIBER:",
              ...slip.fiber.map((f) => `  ${f.code} — ${fmtM(f.lengthM)} m${f.fromCode ? ` (cut from ${f.fromCode})` : ""}`),
              "",
              "ROUTERS:",
              ...slip.routers.map((r) => `  ${r}`),
            ].join("\n");
            navigator.clipboard?.writeText(lines).then(
              () => alert("Slip copied — paste into WhatsApp/SMS."),
              () => alert("Copy failed — select the text manually.")
            );
          }}
        >
          📋 Copy for WhatsApp
        </Btn>
        <Btn variant="ghost" onClick={onDone}>
          ← Start another issue
        </Btn>
      </div>

      <div className="print-page mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="border-b-2 border-gray-900 pb-4 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide">Handover Slip</h1>
          <p className="mt-1 text-sm text-gray-600">Broadband Installation — Inventory Tracker</p>
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <div>
            <div className="text-gray-500">Team</div>
            <div className="text-lg font-semibold">{slip.team}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">Date</div>
            <div className="text-lg font-semibold">{slip.date}</div>
          </div>
        </div>

        <h2 className="mt-6 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide">
          Fiber cable ({slip.fiber.length} items — {fmtM(slip.fiber.reduce((t, f) => t + f.lengthM, 0))} m)
        </h2>
        {slip.fiber.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">None.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <th className="py-1">Piece</th>
                <th className="py-1 text-right">Length</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {slip.fiber.map((f, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium">{f.code}</td>
                  <td className="py-1.5 text-right">{fmtM(f.lengthM)} m</td>
                  <td className="py-1.5 text-gray-500">{f.fromCode ? `cut from ${f.fromCode}` : "whole piece"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="mt-6 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wide">
          Routers ({slip.routers.length})
        </h2>
        {slip.routers.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">None.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
            {slip.routers.map((r) => (
              <li key={r} className="font-medium">
                {r}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-gray-400 pt-2">Handed over by (signature)</div>
          <div className="border-t border-gray-400 pt-2">Received by (signature)</div>
        </div>
        <p className="mt-8 text-center text-xs text-gray-400">
          Generated by Inventory Tracker on {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}
