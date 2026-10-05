import { useId, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

type MessageMode = "default" | "custom";

type MessageCustomizationDialogProps<T> = {
  triggerId?: string;
  title: string;
  description: string;
  value: T;
  defaultValue: T;
  isDefault: (value: T) => boolean;
  onApply: (value: T) => void;
  renderEditor: (value: T, onChange: (value: T) => void) => ReactNode;
  defaultMessage: ReactNode;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function MessageCustomizationDialog<T>({
  triggerId,
  title,
  description,
  value,
  defaultValue,
  isDefault,
  onApply,
  renderEditor,
  defaultMessage,
}: MessageCustomizationDialogProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MessageMode>("default");
  const [draft, setDraft] = useState<T>(() => clone(value));
  const usesDefault = isDefault(value);

  const openDialog = () => {
    setDraft(clone(value));
    setMode(usesDefault ? "default" : "custom");
    setOpen(true);
  };

  const apply = () => {
    onApply(mode === "default" ? clone(defaultValue) : draft);
    setOpen(false);
  };

  return (
    <>
      <Button
        id={triggerId}
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={openDialog}
        aria-label={`${title}: ${usesDefault ? "mesaj implicit" : "mesaj personalizat"}`}
      >
        Personalizează mesajul
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
          {usesDefault ? "Implicit" : "Personalizat"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={mode}
            onValueChange={(next) => setMode(next as MessageMode)}
            className="grid gap-3 sm:grid-cols-2"
            aria-label="Alege tipul mesajului"
          >
            <label
              htmlFor={`${id}-default`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                mode === "default" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <RadioGroupItem id={`${id}-default`} value="default" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Mesaj implicit</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Folosește textul standard al botului.
                </span>
              </span>
            </label>
            <label
              htmlFor={`${id}-custom`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                mode === "custom" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <RadioGroupItem id={`${id}-custom`} value="custom" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Mesaj personalizat</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Scrie textul și folosește variabilele disponibile.
                </span>
              </span>
            </label>
          </RadioGroup>

          {mode === "default" ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {defaultMessage}
            </div>
          ) : (
            <div className="space-y-4">{renderEditor(draft, setDraft)}</div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-left text-xs text-muted-foreground">
              Aplică modificarea în formular, apoi apasă „Salvează” pe pagină pentru a o trimite botului.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anulează
              </Button>
              <Button type="button" onClick={apply}>
                Aplică
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
