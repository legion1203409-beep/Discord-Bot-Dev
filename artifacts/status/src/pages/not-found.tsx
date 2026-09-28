import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="public-not-found flex min-h-[100dvh] w-full items-center justify-center">
      <Card className="public-not-found__card mx-4 w-full max-w-md rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[var(--ember-light)]" />
            <h1 className="font-display text-2xl font-semibold text-[var(--paper)]">Pagina nu există</h1>
          </div>

          <p className="mt-4 text-sm text-[var(--paper-soft)]">
            Poarta a fost închisă.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
