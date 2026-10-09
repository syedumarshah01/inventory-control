import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listDrums, listFiberPieces, type PoolRow } from "@/lib/reports";
import { Badge, Btn, Card, EmptyRow, Input, Td, Th, tableCls } from "@/components/ui";
import { fmtM, todayStr } from "@/lib/dates";
import { nextDrumCode } from "@/lib/fiber";
import { ScrapButton } from "./scrap-button";
import { ReceiveDrumForm } from "./receive-drum-form";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "IN_STOCK", label: "In stock" },
  { key: "ISSUED", label: "Issued" },
  { key: "CONSUMED", label: "Used" },
  { key: "SCRAP", label: "Scrap" },
  { key: "ALL", label: "All" },
];

export default async function FiberPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "IN_STOCK";
  const q = sp.q?.trim() ?? "";
  const db = getDb();
  const pieces = listFiberPieces(db, status === "ALL" ? undefined : status).filter(
    (p) => !q || p.code.toLowerCase().includes(q.toLowerCase()) || p.drum_code.toLowerCase().includes(q.toLowerCase())
  );
  const drums = listDrums(db) as Record<string, string | number>[];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Fiber</h1>

      <Card title="Receive drum">
        <ReceiveDrumForm nextCode={nextDrumCode(db)} today={todayStr()} />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/fiber?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded px-2.5 py-1.5 text-sm ${
              f.key === status ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <form action="/fiber" method="GET" className="ml-auto flex gap-1.5">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q} placeholder="Search…" className="w-36" />
          <Btn variant="secondary" type="submit">
            Find
          </Btn>
        </form>
      </div>

      <div className="scroll-x overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Piece</Th>
              <Th className="text-right">Length</Th>
              <Th>Status</Th>
              <Th>From / with</Th>
              <Th className="text-right">Age</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {pieces.length === 0 && <EmptyRow cols={6} message="Nothing here." />}
            {pieces.map((p: PoolRow) => (
              <tr key={p.id}>
                <Td className="font-medium">
                  <Link href={`/fiber/${p.id}`} className="hover:underline">
                    {p.code}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{fmtM(p.length_m)} m</Td>
                <Td>
                  <Badge status={p.status} />
                </Td>
                <Td className="text-gray-500">
                  {p.status === "ISSUED" ? p.team_name : p.drum_code}
                  {p.parent_code && <span className="text-gray-300"> ← {p.parent_code}</span>}
                </Td>
                <Td className="text-right text-gray-400">{p.age_days}d</Td>
                <Td>
                  {p.status === "IN_STOCK" && <ScrapButton pieceId={p.id} code={p.code} />}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card title="Drums">
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right">Out</Th>
                <Th className="text-right">Used</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {drums.length === 0 && <EmptyRow cols={6} message="No drums yet." />}
              {drums.map((d) => (
                <tr key={String(d.id)}>
                  <Td className="font-medium">
                    {String(d.code)}
                    {d.supplier ? <span className="ml-2 text-gray-400">{String(d.supplier)}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{fmtM(Number(d.total_length_m))} m</Td>
                  <Td className="text-right tabular-nums">{fmtM(Number(d.stock_m))} m</Td>
                  <Td className="text-right tabular-nums">{fmtM(Number(d.out_m))} m</Td>
                  <Td className="text-right tabular-nums">{fmtM(Number(d.used_m))} m</Td>
                  <Td className="text-gray-400">{String(d.date_received)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
