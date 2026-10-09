import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cableUsageReport, longestHeldReport, routerInstallsReport } from "@/lib/reports";
import { Card, EmptyRow, Input, Td, Th, tableCls } from "@/components/ui";
import { downloadHref } from "@/lib/links";
import { addDays, fmtM, todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const from = sp.from || addDays(todayStr(), -30);
  const to = sp.to || todayStr();
  const db = getDb();

  const cable = cableUsageReport(db, from, to);
  const installs = routerInstallsReport(db, from, to);
  const longest = longestHeldReport(db, 50);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      <Card>
        <form className="grid gap-3 sm:grid-cols-3" action="/reports" method="GET">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">From</span>
            <Input type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">To</span>
            <Input type="date" name="to" defaultValue={to} />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2 text-base font-medium text-white hover:bg-brand-700"
            >
              Run reports
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Cable used per team"
        actions={
          <a
            href={downloadHref("report-cable", { from, to })}
            className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </a>
        }
      >
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th className="text-right">Cable used</Th>
                <Th className="text-right">Returns</Th>
                <Th className="text-right">Connections</Th>
                <Th className="text-right">Meters / connection</Th>
                <Th>Flag</Th>
              </tr>
            </thead>
            <tbody>
              {cable.length === 0 && <EmptyRow cols={6} message="No data in this range." />}
              {cable.map((r) => (
                <tr key={r.team_id} className={r.flag ? "bg-amber-50" : "hover:bg-gray-50"}>
                  <Td className="font-medium text-gray-900">{r.team}</Td>
                  <Td className="text-right font-semibold">{fmtM(r.used_m)} m</Td>
                  <Td className="text-right">{r.returns}</Td>
                  <Td className="text-right">{r.connections}</Td>
                  <Td className="text-right">{r.m_per_conn !== null ? `${fmtM(r.m_per_conn)} m` : "—"}</Td>
                  <Td>
                    {r.flag ? (
                      <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                        ⚠️ &gt;25% above average
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Routers installed per team"
        actions={
          <a
            href={downloadHref("report-installs", { from, to })}
            className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </a>
        }
      >
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th className="text-right">Installed</Th>
                <Th className="w-2/3">Share</Th>
              </tr>
            </thead>
            <tbody>
              {installs.map((r) => {
                const max = Math.max(...installs.map((x) => x.installed), 1);
                return (
                  <tr key={r.team_id} className="hover:bg-gray-50">
                    <Td className="font-medium text-gray-900">{r.team}</Td>
                    <Td className="text-right font-semibold">{r.installed}</Td>
                    <Td>
                      <div className="h-3 rounded-full bg-gray-100">
                        <div
                          className="h-3 rounded-full bg-brand-500"
                          style={{ width: `${Math.round((r.installed / max) * 100)}%` }}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Items held longest (with teams right now)"
        actions={
          <a
            href={downloadHref("report-longest-held")}
            className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </a>
        }
      >
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Type</Th>
                <Th>Team</Th>
                <Th className="text-right">Days held</Th>
              </tr>
            </thead>
            <tbody>
              {longest.length === 0 && <EmptyRow cols={4} message="Nothing is out with teams right now." />}
              {longest.map((r) => (
                <tr key={`${r.item_type}-${r.item_id}`} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={r.item_type === "FIBER" ? `/fiber/${r.item_id}` : `/routers/${r.item_id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.item_code}
                    </Link>
                  </Td>
                  <Td>{r.item_type === "FIBER" ? "Fiber" : "Router"}</Td>
                  <Td>{r.team}</Td>
                  <Td className="text-right font-semibold">{r.days} d</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
