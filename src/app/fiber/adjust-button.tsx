"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Field, Input, Select, apiFetch } from "@/components/ui";
import { useToast } from "@/components/toast";

/** "Adjust / Correct" with a required reason — logged as CORRECTION. */
export function AdjustFiberButton({
  pieceId,
  code,
  currentLengthM,
  currentStatus,
}: {
  pieceId: number;
  code: string;
  currentLengthM: number;
  currentStatus: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newLengthM, setNewLengthM] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/fiber/adjust", {
        method: "POST",
        body: JSON.stringify({
          pieceId,
          reason,
          newLengthM: newLengthM === "" ? undefined : Number(newLengthM),
          newStatus: newStatus === "" ? undefined : newStatus,
        }),
      });
      toast.show(`Correction saved for ${code}.`, "success");
      setOpen(false);
      setNewLengthM("");
      setNewStatus("");
      setReason("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Btn variant="secondary" type="button" onClick={() => setOpen(true)}>
        Adjust / Correct
      </Btn>
    );
  }

  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-3 font-semibold text-gray-900">Correct {code}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`New length (m), now ${currentLengthM}`}>
          <Input
            type="number"
            min={0.1}
            step="any"
            value={newLengthM}
            onChange={(e) => setNewLengthM(e.target.value)}
            placeholder="leave blank to keep"
          />
        </Field>
        <Field label={`New status, now ${currentStatus.replace(/_/g, " ")}`}>
          <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="">— keep current —</option>
            <option value="IN_STOCK">In stock</option>
            <option value="CONSUMED">Consumed</option>
            <option value="SCRAP">Scrap</option>
            <option value="ISSUED">Issued</option>
          </Select>
        </Field>
        <Field label="Reason (required)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why is this being corrected?" />
        </Field>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Btn onClick={submit} disabled={busy || !reason.trim() || (newLengthM === "" && newStatus === "")}>
          {busy ? "Saving…" : "Save correction"}
        </Btn>
        <Btn variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Btn>
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Corrections are never deletions — the change and your reason are written to the piece&apos;s history.
      </p>
    </div>
  );
}
