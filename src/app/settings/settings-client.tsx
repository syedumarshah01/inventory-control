"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card, Field, Input, Td, Th, apiFetch, tableCls } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import type { AppSettings } from "@/lib/settings";

interface Team {
  id: number;
  name: string;
  active: number;
}

export function SettingsClient({
  teams,
  settings,
  backups,
}: {
  teams: Team[];
  settings: AppSettings;
  backups: string[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  // Teams
  const [newTeamName, setNewTeamName] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);

  async function addTeam() {
    setTeamBusy(true);
    try {
      await apiFetch("/api/teams", { method: "POST", body: JSON.stringify({ name: newTeamName }) });
      toast.show(`Team "${newTeamName}" added.`, "success");
      setNewTeamName("");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setTeamBusy(false);
    }
  }

  async function updateTeam(t: Team, name: string, active: boolean) {
    try {
      await apiFetch("/api/teams", {
        method: "POST",
        body: JSON.stringify({ id: t.id, name, active }),
      });
      toast.show(`${name} updated.`, "success");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    }
  }

  async function toggleActive(t: Team) {
    if (t.active) {
      const ok = await confirm({
        title: `Deactivate ${t.name}?`,
        message: "A deactivated team disappears from Daily Issue. It keeps all its history and can be reactivated any time.",
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
    }
    await updateTeam(t, t.name, !t.active);
  }

  // Thresholds
  const [scrap, setScrap] = useState(String(settings.scrapThresholdM));
  const [lowStock, setLowStock] = useState(String(settings.lowStockThreshold));
  const [overdue, setOverdue] = useState(String(settings.overdueDays));
  const [settingsBusy, setSettingsBusy] = useState(false);

  async function saveThresholds() {
    setSettingsBusy(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          scrapThresholdM: Number(scrap),
          lowStockThreshold: Number(lowStock),
          overdueDays: Number(overdue),
        }),
      });
      toast.show("Settings saved.", "success");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setSettingsBusy(false);
    }
  }

  // Password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function savePassword() {
    if (next !== next2) {
      toast.show("New passwords do not match.", "error");
      return;
    }
    setPwBusy(true);
    try {
      await apiFetch("/api/password", {
        method: "POST",
        body: JSON.stringify({ current, next }),
      });
      toast.show("Password changed.", "success");
      setCurrent("");
      setNext("");
      setNext2("");
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setPwBusy(false);
    }
  }

  // Backup
  const [backupBusy, setBackupBusy] = useState(false);

  async function backupNow() {
    setBackupBusy(true);
    try {
      const res = await apiFetch("/api/backup", { method: "POST", body: JSON.stringify({}) });
      toast.show(`Backup created: ${res.file}`, "success");
      router.refresh();
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Card title="Teams">
        <div className="scroll-x overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <TeamRow key={t.id} t={t} onSave={updateTeam} onToggle={toggleActive} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="New team name (e.g. Team 4)"
            className="max-w-xs"
          />
          <Btn onClick={addTeam} disabled={teamBusy || !newTeamName.trim()}>
            Add team
          </Btn>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Teams are never deleted — deactivate instead, so history stays intact.
        </p>
      </Card>

      <Card title="Thresholds">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Scrap threshold (m)" hint="On returns, remainders below this prompt “mark as scrap?”">
            <Input type="number" min={0} step="any" value={scrap} onChange={(e) => setScrap(e.target.value)} />
          </Field>
          <Field label="Low router stock alert" hint="Dashboard warns when in-stock routers drop below this">
            <Input type="number" min={0} step={1} value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
          </Field>
          <Field label="Overdue after (days)" hint="Alert when a team has held an item longer than this">
            <Input type="number" min={1} step={1} value={overdue} onChange={(e) => setOverdue(e.target.value)} />
          </Field>
        </div>
        <Btn className="mt-4" onClick={saveThresholds} disabled={settingsBusy}>
          {settingsBusy ? "Saving…" : "Save thresholds"}
        </Btn>
      </Card>

      <Card title="Change password">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Repeat new password">
            <Input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Btn className="mt-4" onClick={savePassword} disabled={pwBusy || !current || !next}>
          {pwBusy ? "Saving…" : "Change password"}
        </Btn>
        <p className="mt-2 text-xs text-gray-500">
          The password started as the AUTH_PASSWORD environment variable; changing it here overrides that.
        </p>
      </Card>

      <Card title="Database backup">
        <p className="text-sm text-gray-600">
          Everything lives in a single SQLite file (<code className="rounded bg-gray-100 px-1">data/inventory.db</code>).
          A backup is taken automatically once a day when you open the app, and you can download a copy any time.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/api/backup/download"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-base font-medium text-white hover:bg-brand-700"
          >
            ⬇ Download database
          </a>
          <Btn variant="secondary" onClick={backupNow} disabled={backupBusy}>
            {backupBusy ? "Backing up…" : "Back up now"}
          </Btn>
        </div>
        {backups.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Recent backups (backups/)</h3>
            <ul className="space-y-1 text-sm text-gray-600">
              {backups.map((b) => (
                <li key={b} className="font-mono text-xs">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function TeamRow({
  t,
  onSave,
  onToggle,
}: {
  t: Team;
  onSave: (t: Team, name: string, active: boolean) => Promise<void>;
  onToggle: (t: Team) => Promise<void>;
}) {
  const [name, setName] = useState(t.name);
  const dirty = name.trim() !== t.name && name.trim() !== "";
  return (
    <tr>
      <Td>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-48" />
      </Td>
      <Td>
        <Badge status={t.active ? "ACTIVE" : "INACTIVE"} />
      </Td>
      <Td>
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="secondary"
            className="min-h-9 px-3 py-1 text-sm"
            onClick={() => onSave(t, name.trim(), !!t.active)}
            disabled={!dirty}
          >
            Save name
          </Btn>
          <Btn
            variant={t.active ? "danger" : "secondary"}
            className="min-h-9 px-3 py-1 text-sm"
            onClick={() => onToggle(t)}
          >
            {t.active ? "Deactivate" : "Activate"}
          </Btn>
        </div>
      </Td>
    </tr>
  );
}
