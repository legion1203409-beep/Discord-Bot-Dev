import type { ReactNode } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { tokens } from '../generated/tokens';

const CORE_SWATCHES = [
  { name: 'Primary · Jar', className: 'bg-primary' },
  { name: 'Secondary · Cărbune', className: 'bg-secondary' },
  { name: 'Accent · Aur', className: 'bg-accent' },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Fundal', className: 'bg-background' },
  { name: 'Suprafață', className: 'bg-card' },
  { name: 'Text secundar', className: 'bg-muted-foreground' },
  { name: 'Pericol', className: 'bg-destructive' },
  { name: 'Informație', className: 'bg-chart-4' },
  { name: 'Succes', className: 'bg-chart-5' },
] as const;

const TYPE_SCALE = [
  { label: 'Titlu editorial', className: 'font-serif text-4xl sm:text-5xl' },
  { label: 'Interfață', className: 'font-sans text-lg font-semibold' },
  { label: 'Corp', className: 'font-sans text-base' },
  { label: 'Metadate', className: 'font-mono text-sm' },
] as const;

const SPACING_SCALE = [
  { label: '4 px', className: 'w-1' },
  { label: '8 px', className: 'w-2' },
  { label: '12 px', className: 'w-3' },
  { label: '16 px', className: 'w-4' },
  { label: '24 px', className: 'w-6' },
] as const;

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground sm:p-6">
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  return (
    <div className="space-y-2">
      <div className={`h-14 rounded-lg border border-border ${className}`} />
      <p className="text-sm font-medium">{name}</p>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-5">
      <Panel title="Paleta principal">
        <div className="mt-4 grid grid-cols-3 gap-3">
          {CORE_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Tipografie">
          <div className="mt-4 space-y-4">
            {TYPE_SCALE.map((entry) => (
              <div key={entry.label}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {entry.label}
                </p>
                <p className={entry.className}>Regatul cenușii</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Componente · pilot">
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button>Continuă</Button>
              <Button variant="outline">Detalii</Button>
              <Button variant="secondary">Anulează</Button>
            </div>
            <Input aria-label="Numele personajului" placeholder="Numele personajului" />
            <Select defaultValue="jar">
              <SelectTrigger aria-label="Alege un jurământ">
                <SelectValue placeholder="Alege un jurământ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jar">Jurământul jarului</SelectItem>
                <SelectItem value="cenusa">Jurământul cenușii</SelectItem>
              </SelectContent>
            </Select>
            <Textarea aria-label="Notiță" placeholder="Adaugă o notiță…" />
            <label className="flex items-center gap-3 text-sm">
              <Switch aria-label="Notificări active" defaultChecked />
              Notificări active
            </label>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function BrandPage() {
  return (
    <div className="space-y-5">
      <Panel title="Numele și semnul">
        <div className="mt-5 rounded-lg border border-border bg-background p-6 sm:p-9">
          <p className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-6xl">
            Oracolul Cenușii
          </p>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Cenușă · Jar · Aur
          </p>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Aplicația sursă folosește numele ca wordmark tipografic și nu include
          un fișier de logo independent. Preview-ul păstrează această abordare
          și nu adaugă un simbol nou.
        </p>
      </Panel>
      <Panel title="Caracter vizual">
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Interfața combină suprafețe întunecate, accente calde și titluri
          editoriale. Tonurile semantice rămân distincte de paleta de brand.
        </p>
      </Panel>
    </div>
  );
}

export function GuidelinesPage() {
  return (
    <Panel title="Reguli extrase din Status">
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
        <li>
          Folosește fundaluri de noapte și panouri de cărbune pentru suprafețele
          principale; păstrează separarea prin borduri discrete.
        </li>
        <li>
          Rezervă jarul pentru acțiuni și evidențieri, iar aurul pentru detalii,
          metadate și accente.
        </li>
        <li>
          Folosește Cormorant Garamond la titlurile editoriale, DM Sans pentru
          interfață și DM Mono pentru etichete compacte.
        </li>
        <li>
          Păstrează culorile semantice distincte: verde pentru succes,
          albastru pentru informare și roșu pentru erori.
        </li>
        <li>
          Păstrează indicatorii de secțiune scurți, cu majuscule și spațiere
          amplă între litere.
        </li>
      </ul>
    </Panel>
  );
}

export function ColorsPage() {
  const sourceDark = tokens.color.dark;
  const derivedLight = tokens.color.light;
  type Palette = Record<keyof typeof sourceDark, string>;
  const themeRoles = [
    ['Primary · Jar', 'primary'],
    ['Secondary · Cărbune', 'secondary'],
    ['Accent · Aur', 'accent'],
    ['Fundal', 'background'],
    ['Suprafață', 'card'],
    ['Text secundar', 'mutedForeground'],
    ['Pericol', 'destructive'],
    ['Informare', 'chart4'],
    ['Succes', 'chart5'],
  ] as const;

  const ThemePanel = ({
    title,
    palette,
  }: {
    title: string;
    palette: Palette;
  }) => (
    <section
      className="rounded-xl border p-5 sm:p-6"
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        color: palette.foreground,
      }}
    >
      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.16em] opacity-70">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themeRoles.map(([name, role]) => (
          <div key={role} className="space-y-2">
            <div
              className="h-14 rounded-lg border"
              style={{
                backgroundColor: palette[role],
                borderColor: palette.border,
              }}
            />
            <p className="text-sm font-medium">{name}</p>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <ThemePanel
        title="Tema întunecată · fidelă sursei"
        palette={sourceDark}
      />
      <ThemePanel
        title="Tema deschisă · derivată pentru interoperabilitate"
        palette={derivedLight}
      />
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-5">
      <Panel title="Familii de fonturi">
        <div className="mt-5 space-y-5">
          <p className="font-serif text-4xl font-medium">Cormorant Garamond</p>
          <p className="font-sans text-2xl font-semibold">DM Sans</p>
          <p className="font-mono text-base">DM Mono · 0123456789</p>
        </div>
      </Panel>
      <Panel title="Ierarhie">
        <div className="mt-5 space-y-4">
          {TYPE_SCALE.map((entry) => (
            <div key={entry.label} className="grid gap-2 sm:grid-cols-[150px_1fr]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {entry.label}
              </span>
              <p className={entry.className}>Focul luminează drumul.</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="space-y-5">
      <Panel title="Ritm de spațiere">
        <div className="mt-5 space-y-3">
          {SPACING_SCALE.map((entry) => (
            <div key={entry.label} className="flex items-center gap-3">
              <div className={`h-3 rounded-sm bg-primary ${entry.className}`} />
              <span className="font-mono text-xs text-muted-foreground">
                {entry.label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Pasul de bază al tokenurilor: 4 px.
        </p>
      </Panel>
      <Panel title="Raze de colț">
        <div className="mt-5 flex flex-wrap gap-4">
          {[
            ['sm', 'rounded-sm'],
            ['md', 'rounded-md'],
            ['lg', 'rounded-lg'],
            ['xl', 'rounded-xl'],
          ].map(([label, radius]) => (
            <div
              key={label}
              className={`grid h-20 w-24 place-items-center border border-border bg-secondary text-xs ${radius}`}
            >
              {label}
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Raza de bază a componentelor: 8 px.
        </p>
      </Panel>
    </div>
  );
}
