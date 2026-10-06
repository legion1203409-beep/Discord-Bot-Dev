import { useMemo } from "react";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { activityRoleRewardsError, type ActivityRoleReward } from "../../lib/activity-role-rewards";
import type { ModerationRole } from "../../hooks/use-moderation-api";

interface Props {
  value: ActivityRoleReward[] | null;
  onChange: (value: ActivityRoleReward[] | null) => void;
  roles: ModerationRole[];
  guildId: string;
  disabled?: boolean;
}

type RewardRole = ModerationRole & { activityRewardAssignable?: boolean };

const AUTO_LEVELS = [5, 10, 20, 100];

export function ActivityRoleRewardsEditor({ value, onChange, roles, guildId, disabled = false }: Props) {
  const custom = value !== null;
  const rows = value ?? [];

  const assignable = useMemo(
    () => (roles as RewardRole[]).filter((r) => r.id !== guildId && !r.managed && r.activityRewardAssignable !== false),
    [roles, guildId],
  );
  const globalError = activityRoleRewardsError(value);

  const levelCounts = new Map<number, number>();
  const roleCounts = new Map<string, number>();
  rows.forEach((r) => {
    levelCounts.set(r.level, (levelCounts.get(r.level) ?? 0) + 1);
    if (r.roleId) roleCounts.set(r.roleId, (roleCounts.get(r.roleId) ?? 0) + 1);
  });

  const rowError = (r: ActivityRoleReward): string => {
    if (!Number.isInteger(r.level) || r.level < 1 || r.level > 100) return "Nivelul trebuie să fie un număr întreg între 1 și 100.";
    if (!r.roleId) return "Alege un rol pentru acest prag.";
    if ((levelCounts.get(r.level) ?? 0) > 1) return "Acest nivel este deja folosit.";
    if ((roleCounts.get(r.roleId) ?? 0) > 1) return "Acest rol este deja folosit la alt nivel.";
    return "";
  };

  const setRows = (next: ActivityRoleReward[]) => onChange(next);

  const add = () => {
    const used = new Set(rows.map((r) => r.level));
    let level = [5, 10, 20, 100].find((l) => !used.has(l));
    if (level === undefined) for (let l = 1; l <= 100; l++) if (!used.has(l)) { level = l; break; }
    if (level === undefined) return;
    setRows([...rows, { level, roleId: "" }]);
  };

  const patch = (i: number, p: Partial<ActivityRoleReward>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name;

  return (
    <div className="space-y-4" data-testid="editor-activity-role-rewards">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">Sursa rolurilor de nivel</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Sursa rolurilor de nivel">
          {[
            { id: "auto", on: !custom, title: "Automate", text: "Roluri create de bot la nivelurile 5, 10, 20 și 100; la 100 primește „Legenda Cenușii”." },
            { id: "custom", on: custom, title: "Personalizate", text: "Doar rolurile Discord existente pe care le alegi tu. Lista goală înseamnă fără roluri." },
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.on}
              disabled={disabled}
              data-testid={`radio-rewards-${o.id}`}
              onClick={() => {
                if (o.id === "auto") onChange(null);
                else if (!custom) onChange([]);
              }}
              className={`rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                o.on ? "border-primary bg-primary/10" : "border-border bg-background/50 hover:border-primary/50"
              }`}
            >
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {!custom ? (
        <p className="rounded-lg border border-border/70 bg-background/50 p-3 text-sm text-muted-foreground" data-testid="text-rewards-auto">
          Se folosesc rolurile automate la nivelurile {AUTO_LEVELS.join(", ")}.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="text-rewards-empty">
              Niciun rol de recompensă. Membrii nu vor primi roluri la creșterea nivelului.
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((r, i) => {
              const err = rowError(r);
              const known = roles.some((x) => x.id === r.roleId);
              const sel = (roles as RewardRole[]).find((x) => x.id === r.roleId);
              const unavailable = !!r.roleId && (!known || r.roleId === guildId || !!sel?.managed || sel?.activityRewardAssignable === false);
              const errId = `reward-error-${i}`;
              return (
                <li key={i} className="rounded-lg border border-border bg-background/50 p-3" data-testid={`row-reward-${i}`}>
                  <div className="grid gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">Nivel</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        step={1}
                        value={Number.isFinite(r.level) ? r.level : ""}
                        readOnly={disabled}
                        disabled={disabled}
                        aria-invalid={!!err}
                        aria-describedby={err ? errId : undefined}
                        data-testid={`input-reward-level-${i}`}
                        onChange={(e) => patch(i, { level: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                      />
                    </label>
                    <label className="block min-w-0 space-y-1 text-sm">
                      <span className="font-medium">Rol Discord</span>
                      <Select value={r.roleId} onValueChange={(roleId) => patch(i, { roleId })} disabled={disabled}>
                        <SelectTrigger aria-label={`Rol pentru nivelul ${Number.isFinite(r.level) ? r.level : i + 1}`} aria-invalid={!!err} data-testid={`select-reward-role-${i}`}>
                          <SelectValue placeholder="Alege un rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {unavailable && (
                            <SelectItem value={r.roleId} disabled>
                              Indisponibil · {roleName(r.roleId) ?? r.roleId}
                            </SelectItem>
                          )}
                          {assignable.map((role) => (
                            <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={disabled}
                      aria-label={`Șterge recompensa ${i + 1}`}
                      data-testid={`button-reward-delete-${i}`}
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {unavailable && (
                    <p className="mt-2 flex items-start gap-2 text-xs text-destructive">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Rolul salvat nu mai poate fi acordat (șters, gestionat de integrare sau @everyone). Înlocuiește-l sau șterge recompensa.
                    </p>
                  )}
                  {err && <p id={errId} role="alert" className="mt-2 text-xs text-destructive">{err}</p>}
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="outline" className="gap-2" disabled={disabled || rows.length >= 100} onClick={add} data-testid="button-reward-add">
            <Plus className="h-4 w-4" /> Adaugă recompensă
          </Button>
          {globalError && rows.every((r) => !rowError(r)) && (
            <p role="alert" className="text-xs text-destructive">{globalError}</p>
          )}
          {assignable.length === 0 && (
            <p className="text-xs text-muted-foreground">Nu există roluri eligibile. Rolurile @everyone și cele gestionate de integrări nu pot fi folosite.</p>
          )}
        </div>
      )}

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Când un membru atinge un prag mai mare, primește noul rol și pierde doar rolul de nivel anterior; celelalte roluri rămân neschimbate.</li>
        {custom && <li>În modul personalizat botul nu creează roluri; folosește exclusiv rolurile alese aici.</li>}
        <li>Botul are nevoie de permisiunea Manage Roles, iar rolul lui trebuie să fie deasupra rolurilor acordate.</li>
      </ul>
    </div>
  );
}
