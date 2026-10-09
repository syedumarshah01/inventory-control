"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Input, apiFetch } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

/** "Mark as scrap" action for pool pieces (never deletes — logs MARKED_SCRAP). */
export function ScrapButton({ pieceId, code }: { pieceId: number; code: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const ok = await confirm({
      title: `Scrap ${code}?`,
      message: "The piece is moved to scrap and leaves the pool. It is never deleted — the action is logged with your reason.",
      confirmLabel: "Mark as scrap",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch("/api/fiber/scrap", {
        method: "POST",
        body: JSON.stringify({ pieceId, reason }),
      });
      toast.show(`${code} marked as scrap.`, "success");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-red-600 hover:underline"
      >
        Scrap
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-48"
      />
      <Btn variant="danger" className="min-h-9 px-3 py-1 text-sm" onClick={submit} disabled={busy || !reason.trim()}>
        {busy ? "Saving…" : "Confirm scrap"}
      </Btn>
      <Btn variant="secondary" className="min-h-9 px-2 py-1 text-sm" onClick={() => setOpen(false)}>
        Cancel
      </Btn>
    </div>
  );
}
