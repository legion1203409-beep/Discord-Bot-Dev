type MessageRule = { action: string; deleteMessage?: boolean };

/** Legacy "delete" actions are displayed as deletion without a member sanction. */
export function autoModActionSelection(rule: MessageRule) {
  return {
    sanction: rule.action === "delete" ? "none" : rule.action,
    deleteMessage: rule.action === "delete" || rule.deleteMessage === true,
  };
}

export function selectAutoModSanction<T extends MessageRule>(rule: T, sanction: string): T {
  return {
    ...rule,
    action: sanction,
    deleteMessage: autoModActionSelection(rule).deleteMessage,
  };
}

export function selectAutoModDeletion<T extends MessageRule>(rule: T, deleteMessage: boolean): T {
  return {
    ...rule,
    action: autoModActionSelection(rule).sanction,
    deleteMessage,
  };
}

export function toggleAutoModAction(rule: MessageRule, option: string, checked: boolean): { action: string; deleteMessage: boolean } {
  const selection = autoModActionSelection(rule);
  return {
    action: option === "delete" ? selection.sanction
      : checked ? option : selection.sanction === option ? "none" : selection.sanction,
    deleteMessage: option === "delete" ? checked : selection.deleteMessage,
  };
}

type AiActions = MessageRule & {
  categorySettings?: Record<string, { action?: string; deleteMessage?: boolean; sensitivity?: string }>;
};

export function aiCategoryActions(ai: AiActions, category: string): MessageRule {
  const override = ai.categorySettings?.[category];
  return {
    action: override?.action ?? ai.action,
    deleteMessage: override?.deleteMessage ?? ai.deleteMessage,
  };
}

export function inheritsAiCategoryActions(ai: AiActions, category: string): boolean {
  const override = ai.categorySettings?.[category];
  return override?.action === undefined && override?.deleteMessage === undefined;
}

export function setAiCategoryActions<T extends AiActions>(ai: T, category: string, next: MessageRule | undefined): T {
  const override = { ...ai.categorySettings?.[category] };
  if (next) {
    const selection = autoModActionSelection(next);
    override.action = selection.sanction;
    override.deleteMessage = selection.deleteMessage;
  } else {
    delete override.action;
    delete override.deleteMessage;
  }
  return { ...ai, categorySettings: { ...ai.categorySettings, [category]: override } };
}