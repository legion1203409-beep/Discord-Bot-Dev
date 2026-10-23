import { Switch } from '../../components/ui/switch';

export function SwitchDemo() {
  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      <label
        htmlFor="switch-notifications"
        className="flex items-center justify-between gap-5"
      >
        <span>
          <span className="block text-sm font-medium">Notificări Discord</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Primește alerte pentru evenimentele serverului.
          </span>
        </span>
        <Switch id="switch-notifications" defaultChecked />
      </label>
      <div className="flex items-center justify-between gap-5 border-t pt-4">
        <span className="text-sm font-medium">Dezactivat</span>
        <Switch aria-label="Setare dezactivată" disabled />
      </div>
    </div>
  );
}
