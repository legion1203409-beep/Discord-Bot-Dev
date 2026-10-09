import type { InteractionEditReplyOptions } from "discord.js";
import { serializeBotOperation } from "./operation-lock";

type EditReply = (payload: InteractionEditReplyOptions) => Promise<unknown>;

/** Retry the same message edit, never the combat or reward writes that produced it. */
export class QuestNotifications {
  private readonly pending = new Map<string, InteractionEditReplyOptions>();

  async recover(key: string, editReply: EditReply): Promise<boolean> {
    if (!this.pending.has(key)) return false;
    return serializeBotOperation(`quest-notification:${key}`, async () => {
      const payload = this.pending.get(key);
      // Another click may already have recovered this notification while we waited.
      if (payload) {
        await editReply(payload);
        this.pending.delete(key);
      }
      return true;
    });
  }

  async deliver(
    key: string,
    payload: InteractionEditReplyOptions,
    hasQuestReward: boolean,
    editReply: EditReply,
  ): Promise<void> {
    await serializeBotOperation(`quest-notification:${key}`, async () => {
      if (hasQuestReward) this.pending.set(key, payload);
      await editReply(payload);
      if (hasQuestReward) this.pending.delete(key);
    });
  }
}

export const questNotifications = new QuestNotifications();
