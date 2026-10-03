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