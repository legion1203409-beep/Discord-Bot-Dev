import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

export function SelectDemo() {
  return (
    <div className="max-w-xl space-y-5 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="space-y-2">
        <p className="text-sm font-medium">Alege un jurământ</p>
        <Select defaultValue="embers">
          <SelectTrigger aria-label="Alege un jurământ">
            <SelectValue placeholder="Selectează…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Căile oracolului</SelectLabel>
              <SelectItem value="embers">Jurământul jarului</SelectItem>
              <SelectItem value="ash">Jurământul cenușii</SelectItem>
              <SelectItem value="gold">Jurământul aurului</SelectItem>
              <SelectItem value="sealed" disabled>
                Pecetluit
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Deschide lista și folosește săgețile, Home/End sau tastele literelor;
        Enter confirmă alegerea, iar Escape închide lista.
      </p>
    </div>
  );
}
