import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDashboardData } from "@/lib/reports";
import { Card, StatCard, Badge, EmptyRow, Td, Th, tableCls, LinkBtn } from "@/components/ui";
import { fmtM } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const data = getDashboardData(getDb());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-2">
          <LinkBtn href="/issue" variant="primary">
            + Daily Issue
          </LinkBtn>
          <LinkBtn href="/return">Daily Return</LinkBtn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Routers in stock" value={data.routers.inStock} tone="green" />
        <StatCard label="Routers with teams" value={data.routers.withTeams} tone="blue" />
        <StatCard label="Installed today" value={data.routers.installedToday} />
        <StatCard label="Faulty routers" value={data.routers.faulty} tone={data.routers.faulty > 0 ? "red" : "default"} />
        <StatCard label="Fiber in stock" value={`${fmtM(data.fiber.inStockM)} m`} tone="green" />
        <StatCard label="Pieces in pool" value={data.fiber.poolPieces} />
        <StatCard label="Fiber out with teams" value={`${fmtM(data.fiber.outM)} m`} tone="blue" sub={`${data.fiber.outPieces} pieces`} />
        <StatCard
          label="Active teams"
          value={data.teams.filter((t) => t.active).length}
          sub={`${data.teams.length} total`}
        />
      </div>

      {data.alerts.length > 0 && (
        <Card title="Alerts">
          <ul className="space-y-2">
            {data.alerts.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                  a.severity === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : a.severity === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                }`}
              >
                <span aria-hidden>{a.severity === "error" ? "⛔" : a.severity === "warn" ? "⚠️" : "ℹ️"}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Per team">
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th>Status</Th>
                <Th className="text-right">Routers held</Th>
                <Th className="text-right">Fiber held</Th>
                <Th className="text-right">Pieces</Th>
                <Th className="text-right">Oldest item</Th>
                <Th>Closed out today</Th>
              </tr>
            </thead>
            <tbody>
              {data.teams.length === 0 && <EmptyRow cols={7} message="Add teams in Settings to get started." />}
              {data.teams.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <Td className="font-medium text-gray-900">
                    <Link href={`/ledger?teamId=${t.id}`} className="text-brand-700 hover:underline">
                      {t.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge status={t.active ? "ACTIVE" : "INACTIVE"} />
                  </Td>
                  <Td className="text-right font-medium">{t.routersHeld}</Td>
                  <Td className="text-right font-medium">{fmtM(t.fiberHeldM)} m</Td>
                  <Td className="text-right">{t.fiberPieces}</Td>
                  <Td className="text-right">{t.oldestDays !== null ? `${t.oldestDays} d` : "—"}</Td>
                  <Td>
                    {t.closedOutToday ? (
                      <Badge status="IN_STOCK">DONE</Badge>
                    ) : t.routersHeld + t.fiberPieces > 0 ? (
                      <Badge status="SCRAP">NOT YET</Badge>
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
    </div>
  );
}
