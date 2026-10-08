import { REST, Routes, type Guild, type OverwriteData, PermissionsBitField } from "discord.js";

const clients = new WeakMap<object, REST>();
function setupRest(guild: Guild): REST {
  let rest = clients.get(guild.client);
  if (!rest) {
    if (!guild.client.token) throw new Error("Botul nu este conectat.");
    // Discord POST creation is not idempotent. SDK defaults retry timeouts
    // and 5xx, potentially creating duplicates before our journal can reconcile.
    rest = new REST({ ...guild.client.rest.options, retries: 0 }).setToken(guild.client.token);
    clients.set(guild.client, rest);
  }
  return rest;
}

export async function createSetupRole(guild: Guild, name: string): Promise<{ id: string }> {
  return await setupRest(guild).post(Routes.guildRoles(guild.id), {
    body: { name, permissions: "0" }, reason: "Pornire server: confirmare operator",
  }) as { id: string };
}

export async function createSetupChannel(guild: Guild, options: {
  name: string; type: number; parent?: string; permissionOverwrites: OverwriteData[]; reason?: string;
}): Promise<{ id: string }> {
  return await setupRest(guild).post(Routes.guildChannels(guild.id), {
    body: {
      name: options.name, type: options.type, parent_id: options.parent,
      permission_overwrites: Array.from(options.permissionOverwrites ?? []).map(o => ({
        id: o.id, type: o.type,
        allow: new PermissionsBitField(o.allow ?? []).bitfield.toString(),
        deny: new PermissionsBitField(o.deny ?? []).bitfield.toString(),
      })),
    },
    reason: "Pornire server: confirmare operator",
  }) as { id: string };
}
