export function shouldDeleteAutoModMessage(
  action: string,
  deleteMessage: boolean | undefined,
  alwaysDelete = false,
): boolean {
  return action === "delete" || deleteMessage === true || alwaysDelete;
}

export function shouldApplyLinkBlockInChannel(
  configuredChannelIds: readonly string[] | undefined,
  channelId: string,
  parentChannelId?: string | null,
): boolean {
  if (!configuredChannelIds?.length) return true;
  return configuredChannelIds.includes(channelId)
    || Boolean(parentChannelId && configuredChannelIds.includes(parentChannelId));
}
