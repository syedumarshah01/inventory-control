"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Input, Textarea, apiFetch } from "@/components/ui";
import { useToast } from "@/components/toast";

/** Inline bulk add: paste serials, get instant duplicate flags, save. */
export function ReceiveRoutersForm() {
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { list, dupes } = useMemo(() => {
    const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const list: string[] = [];
    let dupes = 0;
    for (const p of parts) {
      const key = p.toUpperCase();
      if (seen.has(key)) {
        dupes += 1;
        continue;
      }
      seen.add(key);
      list.push(p);
    }
    return { list, dupes };
  }, [text]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/receive/routers", {
        method: "POST",
        body: JSON.stringify({ serials: list, model }),
      });
      toast.show(`Added ${res.count} router(s).`, "success");
      setText("");
      setModel("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste serials — newlines, commas or spaces"
          className="max-w-md font-mono text-xs"
        />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-1 block text-xs text-gray-500">Model</span>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="optional" className="w-36" />
          </div>
          <Btn onClick={submit} disabled={busy || list.length === 0 || dupes > 0}>
            {busy ? "Saving…" : `Add ${list.length || ""}`}
          </Btn>
        </div>
      </div>
      {dupes > 0 && <p className="mt-1 text-xs text-amber-700">{dupes} duplicate(s) in your paste — remove them first.</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
