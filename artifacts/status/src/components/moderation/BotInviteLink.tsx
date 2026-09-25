import { Bot } from "lucide-react";
import { Button } from "../ui/button";

export function BotInviteLink({
  href,
  className,
  label = "Invită botul pe server",
}: {
  href?: string | null;
  className?: string;
  label?: string;
}) {
  if (!href) return null;

  return (
    <Button asChild variant="outline" className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid="link-invite-bot">
        <Bot className="h-4 w-4" aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}