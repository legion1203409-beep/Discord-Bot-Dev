import { Textarea } from '../../components/ui/textarea';

export function TextareaDemo() {
  return (
    <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="space-y-2">
        <label htmlFor="textarea-note" className="text-sm font-medium">
          Notiță pentru staff
        </label>
        <Textarea
          id="textarea-note"
          placeholder="Scrie un mesaj clar și concis…"
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="textarea-disabled" className="text-sm font-medium">
          Dezactivat
        </label>
        <Textarea
          id="textarea-disabled"
          disabled
          placeholder="Nu poate fi editat"
          rows={3}
        />
      </div>
    </div>
  );
}
