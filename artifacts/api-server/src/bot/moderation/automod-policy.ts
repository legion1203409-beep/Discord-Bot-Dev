export function shouldDeleteAutoModMessage(
  action: string,
  deleteMessage: boolean | undefined,
  alwaysDelete = false,
): boolean {
  return action === "delete" || deleteMessage === true || alwaysDelete;
}