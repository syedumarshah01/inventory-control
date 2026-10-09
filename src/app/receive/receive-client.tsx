"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Field, Input, Textarea, apiFetch, Badge, Td, Th, tableCls, EmptyRow } from "@/components/ui";
import { useToast } from "@/components/toast";
import { fmtM } from "@/lib/dates";

export function ReceiveClient({
  nextCode,
  today,
  recentDrums,
}: {
  nextCode: string;
  today: string;
  recentDrums: Record<string, string | number>[];
}) {
  const toast = useToast();
  const router = useRouter();

  // ---- Drum form ----
  const [code, setCode] = useState(nextCode);
  const [supplier, setSupplier] = useState("");
  const [totalLengthM, setTotalLengthM] = useState("");
  const [drumDate, setDrumDate] = useState(today);
  const [drumNotes, setDrumNotes] = useState("");
  const [drumBusy, setDrumBusy] = useState(false);
  const [drumError, setDrumError] = useState("");

  async function saveDrum() {
    setDrumBusy(true);
    setDrumError("");
    try {
      const res = await apiFetch("/api/receive/drum", {
        method: "POST",
        body: JSON.stringify({
          code,
          supplier,
          totalLengthM: Number(totalLengthM),
          dateReceived: drumDate,
          notes: drumNotes,
        }),
      });
      toast.show(`Drum ${res.drumCode} received — pool piece ${res.pieceCode} (${fmtM(Number(totalLengthM))} m).`, "success");
      setCode("");
      setSupplier("");
      setTotalLengthM("");
      setDrumNotes("");
      router.refresh();
    } catch (e) {
      setDrumError((e as Error).message);
    } finally {
      setDrumBusy(false);
    }
  }

  // ---- Bulk routers form ----
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [routerDate, setRouterDate] = useState(today);
  const [routerBusy, setRouterBusy] = useState(false);
  const [routerError, setRouterError] = useState("");
  const [known, setKnown] = useState<Record<string, string> | null>(null);

  const parsed = useMemo(() => {
    const parts = text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const rows: { serial: string; state: "ok" | "dup-input" | "exists"; existingStatus?: string }[] = [];
    for (const p of parts) {
      const key = p.toUpperCase();
      if (seen.has(key)) {
        rows.push({ serial: p, state: "dup-input" });
        continue;
      }
      seen.add(key);
      const k = known?.[key];
      if (k) rows.push({ serial: p, state: "exists", existingStatus: k });
      else rows.push({ serial: p, state: "ok" });
    }
    return rows;
  }, [text, known]);

  const dupCount = parsed.filter((r) => r.state !== "ok").length;
  const okCount = parsed.filter((r) => r.state === "ok").length;

  async function checkExisting() {
    // Load statuses for typed serials so we can flag "already in system" live.
    const res = await apiFetch("/api/receive/routers", {
      method: "POST",
      body: JSON.stringify({
        serials: parsed.map((r) => r.serial),
        preview: true,
      }),
    });
    const map: Record<string, string> = {};
    for (const d of res.alreadyInSystem ?? []) map[d.serial.toUpperCase()] = d.status;
    setKnown(map);
  }

  async function saveRouters() {
    setRouterBusy(true);
    setRouterError("");
    try {
      const res = await apiFetch("/api/receive/routers", {
        method: "POST",
        body: JSON.stringify({
          serials: parsed.map((r) => r.serial),
          model,
          dateReceived: routerDate,
        }),
      });
      toast.show(`Added ${res.count} router(s) to stock.`, "success");
      setText("");
      setModel("");
      setKnown(null);
      router.refresh();
    } catch (e) {
      setRouterError((e as Error).message);
      await checkExisting().catch(() => {});
    } finally {
      setRouterBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Receive Stock</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="New fiber drum">
          <p className="mb-3 text-sm text-gray-500">
            Receiving a drum creates it plus one pool piece of the full length (<code className="rounded bg-gray-100 px-1">{code || nextCode}-A</code>).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Drum code (auto, editable)">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={nextCode} />
            </Field>
            <Field label="Supplier (optional)">
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. FiberWorks Ltd" />
            </Field>
            <Field label="Total length (m)">
              <Input
                type="number"
                min={1}
                step="any"
                value={totalLengthM}
                onChange={(e) => setTotalLengthM(e.target.value)}
                placeholder="e.g. 2000"
              />
            </Field>
            <Field label="Date received">
              <Input type="date" value={drumDate} onChange={(e) => setDrumDate(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes (optional)">
              <Textarea rows={2} value={drumNotes} onChange={(e) => setDrumNotes(e.target.value)} />
            </Field>
          </div>
          {drumError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{drumError}</p>}
          <Btn className="mt-4 w-full sm:w-auto" onClick={saveDrum} disabled={drumBusy || !totalLengthM}>
            {drumBusy ? "Saving…" : "Receive drum"}
          </Btn>

          {recentDrums.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Recent drums</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {recentDrums.map((d) => (
                  <li key={String(d.code)}>
                    <span className="font-medium text-gray-900">{String(d.code)}</span> —{" "}
                    {fmtM(Number(d.total_length_m))} m · {String(d.date_received)}
                    {d.supplier ? ` · ${String(d.supplier)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Add routers in bulk">
          <p className="mb-3 text-sm text-gray-500">
            Paste or type serial numbers — one per line, or separated by commas/spaces. Duplicates are flagged before saving.
          </p>
          <Field label="Serial numbers">
            <Textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => checkExisting().catch(() => {})}
              placeholder={"SN1001\nSN1002\nSN1003"}
              className="font-mono text-sm"
            />
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Model (optional, applied to all)">
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Nokia G-2426G" />
            </Field>
            <Field label="Date received">
              <Input type="date" value={routerDate} onChange={(e) => setRouterDate(e.target.value)} />
            </Field>
          </div>

          {parsed.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-700">Preview ({parsed.length} serials)</span>
                <span className="flex gap-2">
                  <Badge status="IN_STOCK">{okCount} ready</Badge>
                  {dupCount > 0 && <Badge status="SCRAP">{dupCount} to fix</Badge>}
                </span>
              </div>
              <ul className="max-h-52 overflow-auto">
                {parsed.map((r, i) => (
                  <li
                    key={`${r.serial}-${i}`}
                    className={`flex items-center justify-between px-3 py-1.5 text-sm ${
                      r.state === "ok" ? "text-gray-800" : "bg-red-50 text-red-700"
                    }`}
                  >
                    <span className="font-mono">{r.serial}</span>
                    <span className="text-xs font-medium">
                      {r.state === "ok"
                        ? "will be added"
                        : r.state === "dup-input"
                          ? "duplicate in your input"
                          : `already in system (${r.existingStatus?.replace(/_/g, " ")})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {routerError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{routerError}</p>
          )}
          <Btn className="mt-4 w-full sm:w-auto" onClick={saveRouters} disabled={routerBusy || okCount === 0 || dupCount > 0}>
            {routerBusy ? "Saving…" : `Add ${okCount} router(s)`}
          </Btn>
          {dupCount > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Remove or fix the highlighted serials first — nothing is saved until the list is clean.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
