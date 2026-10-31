import { z } from "zod";
import { getManualCommandDefinition, MANUAL_COMMAND_KEYS } from "./manual-command-catalog";

export const protectionFormSchema = z.object({
  protectionEnabled: z.boolean(),
});

const ruleSchema = z.object({
  enabled: z.boolean(),
  action: z.enum(["none", "warn", "mute", "kick", "ban", "delete"]),
  deleteMessage: z.boolean(),
  severity: z.enum(["soft", "normal", "hard"]),
});

export const autoModFormSchema = z.object({
  enabled: z.boolean(),
  wordFilter: ruleSchema,
  linkBlock: ruleSchema,
  forbiddenWords: z.string(),
  aiEnabled: z.boolean(),
  aiAction: z.enum(["none", "warn", "mute", "kick", "ban", "delete"]),
  aiDeleteMessage: z.boolean(),
  aiSensitivity: z.enum(["low", "medium", "high"]),
});

const optionalText = (max: number) => z.preprocess(
  (value: string | undefined) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().max(max).optional(),
);
const optionalNumber = z.preprocess(
  (value: string | number | null | undefined) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().finite().optional(),
);

export const actionSchema = z.object({
  type: z.enum(MANUAL_COMMAND_KEYS),
  targetId: optionalText(25),
  allMembers: z.boolean().default(false),
  reason: optionalText(500),
  durationMinutes: optionalNumber.pipe(z.number().int().min(1).max(40320).optional()),
  channelId: optionalText(25),
  roleId: optionalText(25),
  nickname: optionalText(32),
  amount: optionalNumber.pipe(z.number().int().min(0).max(21600).optional()),
}).superRefine((value, ctx) => {
  const command = getManualCommandDefinition(value.type);
  const bulkRole = value.type === "role" && value.allMembers;
  if (value.allMembers && value.type !== "role") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Opțiunea este disponibilă doar pentru acordarea rolurilor", path: ["allMembers"] });
  }
  if (bulkRole && value.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Elimină ținta individuală înainte de a alege toți membrii", path: ["targetId"] });
  }
  if (command.target === "user" && !value.targetId && !bulkRole) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul țintei este necesar", path: ["targetId"] });
  }
  if (command.target === "channel" && !value.channelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul canalului este necesar", path: ["channelId"] });
  }
  switch (command.extraField) {
    case "durationMinutes":
      if (!value.durationMinutes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Durata este necesară", path: ["durationMinutes"] });
      }
      break;
    case "roleId":
      if (!value.roleId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul rolului este necesar", path: ["roleId"] });
      }
      break;
    case "nickname":
      if (!value.nickname) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numele nou este necesar", path: ["nickname"] });
      }
      break;
    case "purgeAmount":
      if (value.amount === undefined || value.amount < 1 || value.amount > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numărul de mesaje este necesar", path: ["amount"] });
      }
      break;
    case "slowmodeAmount":
      if (value.amount === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numărul de secunde este necesar (0 oprește slowmode)", path: ["amount"] });
      }
      break;
  }
});
