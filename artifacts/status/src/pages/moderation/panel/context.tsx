import { createContext, useContext } from "react";
import type { ChannelOption, RoleOption } from "./fields";
import type { Path } from "./model";

/** What every part of the protection page can read and change. */
export type PanelApi = {
  /** The draft being edited (all of the server's configuration). */
  config: any;
  /** Replaces one value of the draft. */
  set: (path: Path, value: unknown) => void;
  /** Changes one value of the draft starting from its newest state. */
  update: (path: Path, change: (current: any) => any) => void;
  /** Discord channels of the server, or undefined when the list could not be read. */
  channels: ChannelOption[] | undefined;
  /** Discord roles of the server, or undefined when the list could not be read. */
  roles: RoleOption[] | undefined;
  /** Creates a private channel for a destination and selects it. Missing when the page cannot create channels. */
  createChannel?: (destination: string, path: Path) => void;
  /** The destination whose channel is being created right now. */
  creating: string | null;
  /** True when the bot is offline or lacks the permissions to create channels. */
  createDisabled: boolean;
  /** Open or closed rule cards, kept while moving between modules. */
  isOpen: (key: string) => boolean;
  toggleOpen: (key: string) => void;
};

export const PanelContext = createContext<PanelApi | null>(null);

export function usePanel(): PanelApi {
  const api = useContext(PanelContext);
  if (!api) throw new Error("usePanel must be used inside the protection page.");
  return api;
}
