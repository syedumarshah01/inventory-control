"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Field, Input, Select, apiFetch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

/** Adjust / correct a router, or send it back to the supplier — always with a reason. */
export function AdjustRouterButton({
  routerId,
  serial,
  currentStatus,
  currentModel,
}: {
  routerId: number;
  serial: string;
  currentStatus: string;
  currentModel: string | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [newModel, setNewModel] = useState(currentModel ?? "");
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/routers/adjust", {
        method: "POST",
        body: JSON.stringify({
          routerId,
          reason,
          newStatus: newStatus === "" ? undefined : newStatus,
          newModel: newModel === (currentModel ?? "") ? undefined : newModel,
          customerId: customerId === "" ? undefined : customerId,
        }),
      });
      toast.show(`Correction saved for ${serial}.`, "success");
      setOpen(false);
      setReason("");
      setNewStatus("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendToSupplier() {
    const ok = await confirm({
      title: `Return ${serial} to supplier?`,
      message: "Its status becomes RETURNED TO SUPPLIER and the action is logged with your reason.",
      confirmLabel: "Return to supplier",
      danger: true,
    });
    if (!ok) return;
    if (!reason.trim()) {
      setError("Enter a reason first, then press Return to supplier.");
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/routers/adjust", {
        method: "POST",
        body: JSON.stringify({ routerId, action: "RETURN_TO_SUPPLIER", reason }),
      });
      toast.show(`${serial} returned to supplier.`, "success");
      setOpen(false);
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
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-brand-700 hover:underline">
        Adjust
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900">Correct {serial}</h3>
        <p className="mt-1 text-sm text-gray-500">
          Status now: {currentStatus.replace(/_/g, " ")}. Nothing is deleted — corrections are logged.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="New status">
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="">— keep current —</option>
              <option value="IN_STOCK">In stock</option>
              <option value="ISSUED">Issued (to a team)</option>
              <option value="INSTALLED">Installed (needs customer ID)</option>
              <option value="FAULTY">Faulty</option>
              <option value="RETURNED_TO_SUPPLIER">Returned to supplier</option>
            </Select>
          </Field>
          <Field label="Model">
            <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} />
          </Field>
          <Field label="Customer ID (for INSTALLED)">
            <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          </Field>
          <Field label="Reason (required)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why is this being corrected?" />
          </Field>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Saving…" : "Save correction"}
          </Btn>
          <Btn variant="danger" onClick={sendToSupplier} disabled={busy || !reason.trim()}>
            Return to supplier
          </Btn>
          <Btn variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  );
}
