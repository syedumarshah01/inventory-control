import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTeamHistory, getTeamHoldings } from "@/lib/reports";
import {
  Badge,
  Card,
  EmptyRow,
  Td,
  Th,
  tableCls,
  
  Input,
  Select,
} from "@/components/ui";
import { downloadHref } from "@/lib/links";
import { addDays, fmtDate, fmtM, todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const teams = db.prepare("SELECT id, name, active FROM teams ORDER BY id").all() as {
    id: number;
    name: string;
    active: number;
  }[];
  const teamId = Number(sp.teamId) || teams[0]?.id || 0;
  const from = sp.from || addDays(todayStr(), -30);
  const to = sp.to || todayStr();

  const holdings = teamId ? getTeamHoldings(db, teamId) : { fiber: [], routers: [] };
  const history = teamId ? getTeamHistory(db, teamId, from, to) : [];
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";
  const fiberHeld = (holdings.fiber as Record<string, unknown>[]).reduce((s, f) => s + Number(f.length_m), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Team Ledger</h1>
        <a
          href={downloadHref("team-history", { teamId: String(teamId), from, to })}
          className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-4" action="/ledger" method="GET">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Team</span>
            <Select name="teamId" defaultValue={teamId}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">History from</span>
            <Input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">History to</span>
            <Input type="date" name="to" defaultValue={to} />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2 text-base font-medium text-white hover:bg-brand-700"
            >
              Show ledger
            </button>
          </div>
        </form>
      </Card>

      <Card title={`${teamName} — currently holds`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Fiber ({holdings.fiber.length} pieces · {fmtM(fiberHeld)} m)
            </h3>
            {holdings.fiber.length === 0 ? (
              <p className="text-sm text-gray-500">No fiber held.</p>
            ) : (
              <ul className="space-y-1">
                {(holdings.fiber as Record<string, unknown>[]).map((f) => (
                  <li key={String(f.id)} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <Link href={`/fiber/${String(f.id)}`} className="font-medium text-brand-700 hover:underline">
                      {String(f.code)}
                    </Link>
                    <span className="font-semibold">{fmtM(Number(f.length_m))} m</span>
                    <span className="text-gray-500">{String(f.drum_code)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Routers ({holdings.routers.length})</h3>
            {holdings.routers.length === 0 ? (
              <p className="text-sm text-gray-500">No routers held.</p>
            ) : (
              <ul className="space-y-1">
                {(holdings.routers as Record<string, unknown>[]).map((r) => (
                  <li key={String(r.id)} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <Link href={`/routers/${String(r.id)}`} className="font-medium text-brand-700 hover:underline">
                      {String(r.serial_number)}
                    </Link>
                    <span className="text-gray-500">{(r.model as string) ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card title={`History — ${from} → ${to}`}>
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Item</Th>
                <Th>Movement</Th>
                <Th className="text-right">Length</Th>
                <Th>Customer</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <EmptyRow cols={7} message="No movements in this date range." />}
              {(history as Record<string, unknown>[]).map((h, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap">{fmtDate(String(h.date))}</Td>
                  <Td>
                    <Badge status={h.item_type === "FIBER" ? "ISSUED" : "IN_STOCK"}>{String(h.item_type)}</Badge>
                  </Td>
                  <Td>
                    <Link
                      href={h.item_type === "FIBER" ? `/fiber/${String(h.item_id)}` : `/routers/${String(h.item_id)}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {String(h.item_code)}
                    </Link>
                  </Td>
                  <Td>{String(h.type).replace(/_/g, " ")}</Td>
                  <Td className="text-right">{h.length_m !== null && h.length_m !== undefined ? `${fmtM(Number(h.length_m))} m` : "—"}</Td>
                  <Td>{(h.customer_id as string) ?? "—"}</Td>
                  <Td className="max-w-md text-gray-600">{(h.notes as string) ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
