import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPieceDetail } from "@/lib/reports";
import { Badge, Card, EmptyRow, Td, Th, tableCls } from "@/components/ui";
import { fmtDate, fmtM } from "@/lib/dates";
import { AdjustFiberButton } from "../adjust-button";
import { ScrapButton } from "../scrap-button";

export const dynamic = "force-dynamic";

export default async function FiberPiecePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const pieceId = Number(id);
  if (!Number.isFinite(pieceId)) notFound();
  const detail = getPieceDetail(getDb(), pieceId);
  if (!detail) notFound();
  const p = detail.piece as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {String(p.code)} <Badge status={String(p.status)} />
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {fmtM(Number(p.length_m))} m · from {String(p.drum_code)}
            {p.team_name ? ` · with ${String(p.team_name)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <AdjustFiberButton
            pieceId={pieceId}
            code={String(p.code)}
            currentLengthM={Number(p.length_m)}
            currentStatus={String(p.status)}
          />
          {p.status === "IN_STOCK" && <ScrapButton pieceId={pieceId} code={String(p.code)} />}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Drum {String(p.drum_code)}
        {detail.lineage.map((l) => (
          <span key={l.id}>
            {" → "}
            <Link href={`/fiber/${l.id}`} className="text-gray-900 hover:underline">
              {l.code}
            </Link>
          </span>
        ))}
        {" → "}
        <span className="font-medium text-gray-900">{String(p.code)}</span>
      </p>

      {detail.children.length > 0 && (
        <p className="text-sm text-gray-500">
          Cut from this piece:{" "}
          {(detail.children as { id: number; code: string; length_m: number; status: string }[]).map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/fiber/${c.id}`} className="text-gray-900 hover:underline">
                {c.code}
              </Link>{" "}
              ({fmtM(c.length_m)} m)
            </span>
          ))}
        </p>
      )}

      <Card title="History">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>What</Th>
              <Th>Team</Th>
              <Th className="text-right">Meters</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {detail.movements.length === 0 && <EmptyRow cols={5} message="No movements." />}
            {(detail.movements as Record<string, unknown>[]).map((m) => (
              <tr key={String(m.id)}>
                <Td className="whitespace-nowrap text-gray-500">{fmtDate(String(m.date))}</Td>
                <Td>{String(m.type).replace(/_/g, " ").toLowerCase()}</Td>
                <Td className="text-gray-500">{(m.team_name as string) ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {m.length_m !== null && m.length_m !== undefined ? fmtM(Number(m.length_m)) : "—"}
                </Td>
                <Td className="text-gray-500">{(m.notes as string) ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-sm">
        <Link href="/fiber" className="text-gray-500 hover:underline">
          ← Fiber
        </Link>
      </p>
    </div>
  );
}
