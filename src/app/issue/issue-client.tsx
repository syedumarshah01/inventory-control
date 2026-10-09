"use client";

import { useMemo, useRef, useState } from "react";
import { Btn, Card, EmptyRow, Input, Select, Td, Th, apiFetch, tableCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { fmtM } from "@/lib/dates";
import type { PoolRow } from "@/lib/reports";

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
  mode: "WHOLE" | "PARTIAL";
  issueLength: number;
}

export function IssueClient({
  teams,
  pool,
  routerIndex,
  today,
}: {
  teams: Team[];
  pool: PoolRow[];
  routerIndex: RouterRef[];
  today: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState(today);
  const [teamId, setTeamId] = useState<number | "">(() => teams.find((t) => t.active)?.id ?? "");
  const [selected, setSelected] = useState<SelectedFiber[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState("");
  const [serialError, setSerialError] = useState("");
  const [search, setSearch] = useState("");
  const [minLen, setMinLen] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slip, setSlip] = useState<null | { team: string; date: string; fiber: SelectedFiber[]; routers: string[] }>(null);
  const serialRef = useRef<HTMLInputElement>(null);

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";

  const visiblePool = useMemo(() => {
    const min = parseFloat(minLen);
    return pool
      .filter((p) => {
        if (selected.some((s) => s.pieceId === p.id)) return false;
        if (!Number.isNaN(min) && p.length_m < min) return false;
        const q = search.trim().toLowerCase();
        return !q || p.code.toLowerCase().includes(q) || p.drum_code.toLowerCase().includes(q);
      })
      .sort((a, b) => (sort === "asc" ? a.length_m - b.length_m : b.length_m - a.length_m));
  }, [pool, selected, search, minLen, sort]);

  function addPiece(p: PoolRow, lengthText?: string) {
    const n = lengthText ? parseFloat(lengthText) : p.length_m;
    if (!Number.isFinite(n) || n <= 0) return toast.show("Enter a length greater than 0.", "error");
    if (n > p.length_m) return toast.show(`Only ${fmtM(p.length_m)} m left on ${p.code}.`, "error");
    setSelected((s) => [
      ...s,
      {
        pieceId: p.id,
        code: p.code,
        pieceLength: p.length_m,
        mode: n >= p.length_m ? "WHOLE" : "PARTIAL",
        issueLength: n,
      },
    ]);
  }

  const routerMap = useMemo(() => {
    const m = new Map<string, RouterRef>();
    for (const r of routerIndex) m.set(r.serial_number.toUpperCase(), r);
    return m;
  }, [routerIndex]);

  function problem(serial: string): string | null {
    const r = routerMap.get(serial.toUpperCase());
    if (!r) return `${serial} is not in stock yet.`;
    if (r.status === "ISSUED") return `${serial} is with ${r.team ?? "a team"}.`;
    if (r.status === "INSTALLED") return `${serial} is already installed.`;
    if (r.status !== "IN_STOCK") return `${serial} is ${r.status.toLowerCase().replace(/_/g, " ")}.`;
    return null;
  }

  function addSerials(text: string) {
    const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const problems: string[] = [];
    const ok: string[] = [];
    for (const p of parts) {
      if (serials.includes(p) || ok.includes(p)) {
        problems.push(`${p} already added.`);
        continue;
      }
      const err = problem(p);
      if (err) problems.push(err);
      else ok.push(p);
    }
    if (ok.length) setSerials((s) => [...s, ...ok]);
    setSerialError(problems.join(" "));
    setSerialInput("");
    serialRef.current?.focus();
  }

  const totalM = selected.reduce((t, s) => t + s.issueLength, 0);

  async function confirmIssue() {
    if (!teamId) return setError("Pick a team.");
    if (!selected.length && !serials.length) return setError("Add something to issue.");
    setError("");
    const ok = await confirm({
      title: `Issue to ${teamName}?`,
      message: `${selected.length} fiber item(s) (${fmtM(totalM)} m) and ${serials.length} router(s) on ${date}.`,
      confirmLabel: "Issue",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/issue/day", {
        method: "POST",
        body: JSON.stringify({
          teamId,
          date,
          fiber: selected.map((s) => ({
            pieceId: s.pieceId,
            mode: s.mode,
            lengthM: s.issueLength,
          })),
          routerSerials: serials,
        }),
      });
      setSlip({
        team: teamName,
        date,
        fiber: (res.fiber?.issued ?? []).map(
          (f: { pieceId: number; code: string; lengthM: number }) => ({
            pieceId: f.pieceId,
            code: f.code,
            issueLength: f.lengthM,
            pieceLength: f.lengthM,
            mode: "WHOLE" as const,
          })
        ),
        routers: serials,
      });
      setSelected([]);
      setSerials([]);
      toast.show("Issued.", "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (slip) return <Slip slip={slip} onDone={() => setSlip(null)} />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Issue</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1 block text-xs text-gray-500">Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <span className="mb-1 block text-xs text-gray-500">Team</span>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")} className="w-44">
            <option value="">— team —</option>
            {teams
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <Card title="Fiber — small pieces first">
        <div className="mb-2 flex flex-wrap gap-2">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-40" />
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Min m"
            value={minLen}
            onChange={(e) => setMinLen(e.target.value)}
            className="w-24"
          />
          <Select value={sort} onChange={(e) => setSort(e.target.value as "asc" | "desc")} className="w-36">
            <option value="asc">Smallest first</option>
            <option value="desc">Longest first</option>
          </Select>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className={tableCls}>
            <thead className="sticky top-0 bg-white">
              <tr>
                <Th>Piece</Th>
                <Th className="text-right">Length</Th>
                <Th>Drum</Th>
                <Th>Add</Th>
              </tr>
            </thead>
            <tbody>
              {visiblePool.length === 0 && <EmptyRow cols={4} message="No pieces match." />}
              {visiblePool.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.code}</Td>
                  <Td className="text-right tabular-nums">{fmtM(p.length_m)} m</Td>
                  <Td className="text-gray-400">{p.drum_code}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Btn variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => addPiece(p)}>
                        Whole
                      </Btn>
                      <Input
                        type="number"
                        min={0.1}
                        max={p.length_m}
                        step="any"
                        placeholder="m"
                        className="w-16"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addPiece(p, (e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                      />
                      <Btn
                        variant="secondary"
                        className="min-h-8 px-2 py-1 text-xs"
                        onClick={(e) => {
                          const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                          addPiece(p, input.value);
                          input.value = "";
                        }}
                      >
                        Cut
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Routers">
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
              addSerials(serialInput);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              addSerials(text);
            }
          }}
          placeholder="Serial — Enter to add, paste many at once"
          className="max-w-md"
        />
        {serialError && <p className="mt-2 text-sm text-red-600">{serialError}</p>}
        {serials.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {serials.map((s) => (
              <span key={s} className="rounded bg-gray-100 px-2 py-1 text-sm">
                {s}{" "}
                <button type="button" onClick={() => setSerials((x) => x.filter((y) => y !== s))} className="text-gray-400 hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {selected.length > 0 && (
        <Card title={`Selected fiber (${fmtM(totalM)} m)`}>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <span key={s.pieceId} className="flex items-center gap-1.5 rounded bg-gray-100 px-2 py-1 text-sm">
                {s.code}
                {s.mode === "PARTIAL" ? (
                  <input
                    type="number"
                    min={0.1}
                    max={s.pieceLength}
                    step="any"
                    value={s.issueLength}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (!Number.isFinite(n) || n <= 0 || n > s.pieceLength) return;
                      setSelected((x) =>
                        x.map((y) =>
                          y.pieceId === s.pieceId
                            ? { ...y, issueLength: n, mode: n >= y.pieceLength ? "WHOLE" : "PARTIAL" }
                            : y
                        )
                      );
                    }}
                    className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
                  />
                ) : (
                  <span className="text-gray-500">{fmtM(s.pieceLength)} m</span>
                )}
                <button type="button" onClick={() => setSelected((x) => x.filter((y) => y.pieceId !== s.pieceId))} className="text-gray-400 hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Btn onClick={confirmIssue} disabled={busy} className="w-full sm:w-auto">
        {busy ? "Saving…" : `Issue to ${teamName || "team"}`}
      </Btn>
    </div>
  );
}

function Slip({
  slip,
  onDone,
}: {
  slip: { team: string; date: string; fiber: SelectedFiber[]; routers: string[] };
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap gap-2">
        <Btn onClick={() => window.print()}>Print</Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            const text = [
              `HANDOVER — ${slip.date} — ${slip.team}`,
              "",
              ...slip.fiber.map((f) => `fiber ${f.code} — ${fmtM(f.issueLength)} m`),
              ...slip.routers.map((r) => `router ${r}`),
            ].join("\n");
            navigator.clipboard?.writeText(text).then(() => alert("Copied."), () => alert("Copy failed."));
          }}
        >
          Copy text
        </Btn>
        <Btn variant="secondary" onClick={onDone}>
          New issue
        </Btn>
      </div>

      <div className="mx-auto max-w-xl border border-gray-200 p-6">
        <div className="border-b border-gray-900 pb-2 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Handover slip</h2>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <div>
            <div className="text-xs text-gray-400">Team</div>
            <div className="font-medium">{slip.team}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Date</div>
            <div className="font-medium">{slip.date}</div>
          </div>
        </div>

        <h3 className="mt-5 border-b border-gray-200 pb-1 text-xs font-medium text-gray-400">
          Fiber ({fmtM(slip.fiber.reduce((t, f) => t + f.issueLength, 0))} m)
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {slip.fiber.map((f, i) => (
            <li key={i} className="flex justify-between">
              <span>{f.code}</span>
              <span className="tabular-nums">{fmtM(f.issueLength)} m</span>
            </li>
          ))}
          {slip.fiber.length === 0 && <li className="text-gray-400">—</li>}
        </ul>

        <h3 className="mt-5 border-b border-gray-200 pb-1 text-xs font-medium text-gray-400">
          Routers ({slip.routers.length})
        </h3>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
          {slip.routers.map((r) => (
            <li key={r}>{r}</li>
          ))}
          {slip.routers.length === 0 && <li className="text-gray-400">—</li>}
        </ul>

        <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-gray-400">
          <div className="border-t border-gray-300 pt-1">Handed over</div>
          <div className="border-t border-gray-300 pt-1">Received</div>
        </div>
      </div>
    </div>
  );
}
