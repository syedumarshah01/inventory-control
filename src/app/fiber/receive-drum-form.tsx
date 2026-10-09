"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Input, apiFetch } from "@/components/ui";
import { useToast } from "@/components/toast";

/** Inline "receive a drum" form (creates drum + one full-length pool piece). */
export function ReceiveDrumForm({ nextCode, today }: { nextCode: string; today: string }) {
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState(nextCode);
  const [supplier, setSupplier] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/receive/drum", {
        method: "POST",
        body: JSON.stringify({ code, supplier, totalLengthM: Number(lengthM), dateReceived: date }),
      });
      toast.show(`${res.drumCode} received — ${res.pieceCode} in pool.`, "success");
      setCode("");
      setSupplier("");
      setLengthM("");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <span className="mb-1 block text-xs text-gray-500">Code</span>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={nextCode} className="w-32" />
      </div>
      <div>
        <span className="mb-1 block text-xs text-gray-500">Length (m)</span>
        <Input type="number" min={1} step="any" value={lengthM} onChange={(e) => setLengthM(e.target.value)} placeholder="2000" className="w-28" />
      </div>
      <div>
        <span className="mb-1 block text-xs text-gray-500">Supplier</span>
        <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="optional" className="w-40" />
      </div>
      <div>
        <span className="mb-1 block text-xs text-gray-500">Date</span>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>
      <Btn onClick={submit} disabled={busy || !lengthM}>
        {busy ? "Saving…" : "Receive"}
      </Btn>
    </div>
  );
}
