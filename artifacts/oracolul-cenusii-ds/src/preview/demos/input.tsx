import { Input } from '../../components/ui/input';

export function InputDemo() {
  return (
    <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="space-y-2">
        <label htmlFor="input-character" className="text-sm font-medium">
          Numele personajului
        </label>
        <Input id="input-character" placeholder="Ex. Mara" />
      </div>
      <div className="space-y-2">
        <label htmlFor="input-search" className="text-sm font-medium">
          Căutare
        </label>
        <Input id="input-search" type="search" defaultValue="Oracolul" />
      </div>
      <div className="space-y-2">
        <label htmlFor="input-disabled" className="text-sm font-medium">
          Dezactivat
        </label>
        <Input id="input-disabled" disabled placeholder="Indisponibil" />
      </div>
      <div className="space-y-2">
        <label htmlFor="input-invalid" className="text-sm font-medium">
          Stare invalidă
        </label>
        <Input id="input-invalid" aria-invalid="true" defaultValue=" " />
      </div>
    </div>
  );
}
