import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPieceDetail } from "@/lib/reports";
import { Badge, Card, EmptyRow, LinkBtn, Td, Th, tableCls } from "@/components/ui";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{String(p.code)}</h1>
            <Badge status={String(p.status)} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {fmtM(Number(p.length_m))} m · drum {String(p.drum_code)}
            {p.supplier ? ` · ${String(p.supplier)}` : ""} · received {fmtDate(String(p.drum_received))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkBtn href="/fiber">← Back to pool</LinkBtn>
          <AdjustFiberButton
            pieceId={pieceId}
            code={String(p.code)}
            currentLengthM={Number(p.length_m)}
            currentStatus={String(p.status)}
          />
          {p.status === "IN_STOCK" && <ScrapButton pieceId={pieceId} code={String(p.code)} />}
        </div>
      </div>

      <Card title="Lineage">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-medium">Drum {String(p.drum_code)}</span>
          {detail.lineage.map((l) => (
            <span key={l.id} className="flex items-center gap-2">
              <span className="text-gray-400">→</span>
              <Link href={`/fiber/${l.id}`} className="rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-brand-700 hover:underline">
                {l.code} ({fmtM(l.length_m)} m)
              </Link>
            </span>
          ))}
          <span className="text-gray-400">→</span>
          <span className="rounded-lg bg-brand-100 px-3 py-1.5 font-semibold text-brand-800">
            {String(p.code)} ({fmtM(Number(p.length_m))} m)
          </span>
        </div>
        {detail.children.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Cut / returned pieces from this one</h3>
            <div className="flex flex-wrap gap-2">
              {(detail.children as { id: number; code: string; length_m: number; status: string }[]).map((c) => (
                <Link
                  key={c.id}
                  href={`/fiber/${c.id}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {c.code} · {fmtM(c.length_m)} m <Badge status={c.status} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="Movement history">
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Movement</Th>
                <Th>Team</Th>
                <Th className="text-right">Length</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {detail.movements.length === 0 && <EmptyRow cols={5} message="No movements yet." />}
              {(detail.movements as Record<string, unknown>[]).map((m) => (
                <tr key={String(m.id)} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap">{fmtDate(String(m.date))}</Td>
                  <Td>
                    <span className="font-medium text-gray-800">{String(m.type).replace(/_/g, " ")}</span>
                  </Td>
                  <Td>{(m.team_name as string) ?? <span className="text-gray-400">—</span>}</Td>
                  <Td className="text-right">{m.length_m !== null && m.length_m !== undefined ? `${fmtM(Number(m.length_m))} m` : "—"}</Td>
                  <Td className="max-w-md text-gray-600">{(m.notes as string) ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
