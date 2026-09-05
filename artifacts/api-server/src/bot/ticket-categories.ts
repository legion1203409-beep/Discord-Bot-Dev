export type TicketCategoryKind = "staff" | "partnership" | "help_report";

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim();
}

/**
 * Ticket category IDs are shared by Oracle routing and every automated poster.
 * Keeping them in one module prevents a configured ticket channel from also
 * becoming a chest, event, boss, or trader destination.
 */
export const ORACLE_TICKET_CATEGORY_IDS: Record<TicketCategoryKind, string> = {
  staff: envString("ORACLE_STAFF_TICKET_CATEGORY_ID", "1545688369332228167"),
  partnership: envString("ORACLE_PARTNERSHIP_TICKET_CATEGORY_ID", "1545688531144413194"),
  help_report: envString("ORACLE_HELP_REPORT_TICKET_CATEGORY_ID", "1545688638438772796"),
};

export function isTicketCategoryParentId(parentId: string | null | undefined): boolean {
  return Object.values(ORACLE_TICKET_CATEGORY_IDS).includes(parentId ?? "");
}