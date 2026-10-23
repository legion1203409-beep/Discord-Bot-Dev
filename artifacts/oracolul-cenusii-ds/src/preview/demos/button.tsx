import { Button } from '../../components/ui/button';

export function ButtonDemo() {
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="font-semibold">Variante</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primar</Button>
          <Button variant="secondary">Secundar</Button>
          <Button variant="outline">Contur</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="destructive">Periculos</Button>
          <Button variant="link">Legătură</Button>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="font-semibold">Dimensiuni și stări</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Mic</Button>
          <Button>Mediu</Button>
          <Button size="lg">Mare</Button>
          <Button disabled>Dezactivat</Button>
        </div>
      </section>
    </div>
  );
}
