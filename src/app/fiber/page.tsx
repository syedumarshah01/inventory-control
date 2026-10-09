import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listDrums, listFiberPieces } from "@/lib/reports";
import { Badge, Card, EmptyRow, LinkBtn, Td, Th, tableCls } from "@/components/ui";
import { downloadHref } from "@/lib/links";
import { fmtM } from "@/lib/dates";
import { ScrapButton } from "./scrap-button";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "stock", label: "In stock (pool)" },
  { key: "issued", label: "Issued" },
  { key: "consumed", label: "Consumed" },
  { key: "scrap", label: "Scrap" },
  { key: "drums", label: "Drums" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function FiberPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "stock") as TabKey;
  const db = getDb();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Fiber Pool</h1>
        <div className="flex gap-2">
          <a href={downloadHref("fiber", { status: tab === "drums" ? "ALL" : statusFor(tab) })} className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 hover:bg-gray-50">
            Export CSV
          </a>
          <LinkBtn href="/receive" variant="primary">
            + Receive drum
          </LinkBtn>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/fiber?tab=${t.key}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              t.key === tab ? "bg-brand-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "drums" ? <DrumsTable /> : <PiecesTable tab={tab} />}
    </div>
  );
}

function statusFor(tab: TabKey): string {
  return tab === "stock" ? "IN_STOCK" : tab === "issued" ? "ISSUED" : tab === "consumed" ? "CONSUMED" : "SCRAP";
}

function PiecesTable({ tab }: { tab: Exclude<TabKey, "drums"> }) {
  return <PiecesTableInner tab={tab} />;
}

async function PiecesTableInner({ tab }: { tab: Exclude<TabKey, "drums"> }) {
  const rows = listFiberPieces(getDb(), statusFor(tab));
  return (
    <Card>
      <div className="scroll-x overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th className="text-right">Length</Th>
              <Th>Drum</Th>
              <Th>Parent</Th>
              <Th>Team</Th>
              <Th className="text-right">{tab === "issued" ? "Issued" : "Age"}</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={7} message={tab === "stock" ? "The pool is empty — receive a drum or close out a team's leftovers." : "Nothing here."} />
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">
                  <Link href={`/fiber/${r.id}`} className="text-brand-700 hover:underline">
                    {r.code}
                  </Link>
                </Td>
                <Td className="text-right font-semibold">{fmtM(r.length_m)} m</Td>
                <Td>{r.drum_code}</Td>
                <Td>
                  {r.parent_code ? (
                    <span className="text-gray-600">{r.parent_code}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td>{r.team_name ?? <span className="text-gray-400">—</span>}</Td>
                <Td className="text-right text-gray-500">
                  {tab === "issued" && r.issued_date ? `${r.issued_date} (${r.age_days} d)` : `${r.age_days} d`}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/fiber/${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                      Detail
                    </Link>
                    {tab === "stock" && <ScrapButton pieceId={r.id} code={r.code} />}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function DrumsTable() {
  const drums = listDrums(getDb()) as Record<string, string | number>[];
  return (
    <Card>
      <div className="scroll-x overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Supplier</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">In stock</Th>
              <Th className="text-right">Out</Th>
              <Th className="text-right">Used</Th>
              <Th>Received</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {drums.length === 0 && <EmptyRow cols={8} message="No drums received yet." />}
            {drums.map((d) => (
              <tr key={String(d.id)} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900">{String(d.code)}</Td>
                <Td>{(d.supplier as string) ?? <span className="text-gray-400">—</span>}</Td>
                <Td className="text-right font-semibold">{fmtM(Number(d.total_length_m))} m</Td>
                <Td className="text-right">{fmtM(Number(d.stock_m))} m</Td>
                <Td className="text-right">{fmtM(Number(d.out_m))} m</Td>
                <Td className="text-right">{fmtM(Number(d.used_m))} m</Td>
                <Td>{String(d.date_received)}</Td>
                <Td className="max-w-48 truncate text-gray-500">{(d.notes as string) ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
