/**
 * Breslele: grupuri de jucători pe server, cu nume, etichetă, un lider,
 * ofițeri și o cămară comună de Oboli. Se fac cu `/breasla`:
 *   creeaza · invita · paraseste · info · doneaza · imparte · exclude · promoveaza · top
 *
 * Punctele unei bresle sunt punctele de sezon ale membrilor ei în luna
 * aceasta (bot/seasons.ts), deci clasamentul breslelor merge cu sezonul.
 * Setările sunt în gameplayConfig.guilds (Jocul → Bresle, în panou).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { pool } from "@workspace/db";
import { addPlayerGold, tryDeductPlayerGold, upsertPlayer } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig } from "./gameplay-store";
import { seasonKey } from "./seasons";

export type GuildRole = "leader" | "officer" | "member";
export type Brotherhood = { id: number; name: string; tag: string; leaderId: string; bank: number; createdAt: Date };

const INVITE_MS = 10 * 60_000;
const invites = new Map<string, { brotherhoodId: number; guildId: string; inviterId: string; inviteeId: string; expiresAt: number }>();

function settingsOf(guildId: string): GameplayConfig["guilds"] {
  try {
    return getGameplayConfig(guildId).guilds ?? DEFAULT_GAMEPLAY_CONFIG.guilds;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.guilds;
  }
}

let tablesReady: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  if (tablesReady) return tablesReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS rpg_brotherhoods (
      id serial PRIMARY KEY, guild_id text NOT NULL, name text NOT NULL, name_key text NOT NULL, tag text NOT NULL,
      leader_id text NOT NULL, bank integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (guild_id, name_key)
    );
    CREATE TABLE IF NOT EXISTS rpg_brotherhood_members (
      guild_id text NOT NULL, discord_id text NOT NULL, brotherhood_id integer NOT NULL, role text NOT NULL DEFAULT 'member',
      joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (guild_id, discord_id)
    );
    CREATE INDEX IF NOT EXISTS rpg_brotherhood_members_by_brotherhood ON rpg_brotherhood_members (brotherhood_id)`).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  tablesReady = ready;
  return ready;
}

/** A name kept to letters, digits, spaces and a few signs, 3–24 characters; the key ignores case and accents. */
export function cleanBrotherhoodName(raw: string): { name: string; key: string } | null {
  const name = raw.replace(/[^\p{L}\p{N} '\-]/gu, "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 24) return null;
  return { name, key: name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase() };
}

/** A tag of 2–4 letters or digits, upper case. */
export function cleanTag(raw: string | null | undefined, name: string): string {
  const tag = (raw ?? "").normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4);
  if (tag.length >= 2) return tag;
  return name.normalize("NFKD").replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map((word) => word[0]).join("").toUpperCase().slice(0, 4).padEnd(2, "X");
}

function fromRow(row: Record<string, unknown>): Brotherhood {
  return { id: Number(row.id), name: String(row.name), tag: String(row.tag), leaderId: String(row.leader_id), bank: Number(row.bank), createdAt: new Date(String(row.created_at)) };
}

export async function membershipOf(guildId: string, discordId: string): Promise<{ brotherhood: Brotherhood; role: GuildRole } | null> {
  await ensureTables();
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT b.*, m.role FROM rpg_brotherhood_members m JOIN rpg_brotherhoods b ON b.id = m.brotherhood_id
     WHERE m.guild_id = $1 AND m.discord_id = $2`,
    [guildId, discordId],
  );
  return rows[0] ? { brotherhood: fromRow(rows[0]), role: String(rows[0].role) as GuildRole } : null;
}

async function members(brotherhoodId: number): Promise<Array<{ discordId: string; role: GuildRole }>> {
  const { rows } = await pool.query<{ discord_id: string; role: string }>(
    "SELECT discord_id, role FROM rpg_brotherhood_members WHERE brotherhood_id = $1 ORDER BY CASE role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, joined_at",
    [brotherhoodId],
  );
  return rows.map((row) => ({ discordId: String(row.discord_id), role: String(row.role) as GuildRole }));
}

/** The brotherhood's points this month: its members' season points. */
async function points(guildId: string, brotherhoodId: number): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    `SELECT sum(s.points) AS total FROM player_seasons s JOIN rpg_brotherhood_members m ON m.guild_id = s.guild_id AND m.discord_id = s.discord_id
     WHERE s.guild_id = $1 AND s.season = $2 AND m.brotherhood_id = $3`,
    [guildId, seasonKey(), brotherhoodId],
  ).catch(() => ({ rows: [{ total: "0" }] }));
  return Number(rows[0]?.total ?? 0);
}

export async function brotherhoodTop(guildId: string, limit = 10): Promise<Array<Brotherhood & { points: number; members: number }>> {
  await ensureTables();
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT b.*, (SELECT count(*) FROM rpg_brotherhood_members m WHERE m.brotherhood_id = b.id) AS members,
            COALESCE((SELECT sum(s.points) FROM player_seasons s JOIN rpg_brotherhood_members m ON m.guild_id = s.guild_id AND m.discord_id = s.discord_id
                      WHERE s.guild_id = b.guild_id AND s.season = $2 AND m.brotherhood_id = b.id), 0) AS points
     FROM rpg_brotherhoods b WHERE b.guild_id = $1 ORDER BY points DESC, b.created_at ASC LIMIT $3`,
    [guildId, seasonKey(), limit],
  ).catch(async () => (await pool.query<Record<string, unknown>>(
    "SELECT b.*, (SELECT count(*) FROM rpg_brotherhood_members m WHERE m.brotherhood_id = b.id) AS members, 0 AS points FROM rpg_brotherhoods b WHERE b.guild_id = $1 ORDER BY b.created_at LIMIT $2",
    [guildId, limit],
  )));
  return rows.map((row) => ({ ...fromRow(row), points: Number(row.points ?? 0), members: Number(row.members ?? 0) }));
}

const ROLE_LABEL: Record<GuildRole, string> = { leader: "👑 Lider", officer: "🛡️ Ofițer", member: "Membru" };

async function infoEmbed(guildId: string, brotherhood: Brotherhood): Promise<EmbedBuilder> {
  const list = await members(brotherhood.id);
  const settings = settingsOf(guildId);
  return new EmbedBuilder()
    .setColor(0xd94a2b)
    .setTitle(`🏰 [${brotherhood.tag}] ${brotherhood.name}`)
    .setDescription(list.map((member) => `${ROLE_LABEL[member.role]} · <@${member.discordId}>`).join("\n").slice(0, 3_900) || "—")
    .addFields(
      { name: "Membri", value: `${list.length}/${settings.maxMembers}`, inline: true },
      { name: "Cămara", value: `${brotherhood.bank.toLocaleString("ro-RO")} Oboli`, inline: true },
      { name: "Puncte luna aceasta", value: (await points(guildId, brotherhood.id)).toLocaleString("ro-RO"), inline: true },
    )
    .setFooter({ text: "Punctele breslei sunt punctele de sezon ale membrilor. /breasla top — clasamentul." });
}

async function reply(interaction: ChatInputCommandInteraction, content: string, embed?: EmbedBuilder): Promise<void> {
  await interaction.editReply({ content, embeds: embed ? [embed] : [] });
}

export async function handleBrotherhoodCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const settings = settingsOf(guildId);
  if (!settings.enabled) return reply(interaction, "🏰 Breslele sunt oprite pe acest server.");
  await ensureTables();
  const sub = interaction.options.getSubcommand();
  const me = interaction.user.id;
  const mine = await membershipOf(guildId, me);

  if (sub === "creeaza") {
    if (mine) return reply(interaction, `🏰 Ești deja în **${mine.brotherhood.name}**. Părăsește-o întâi cu \`/breasla paraseste\`.`);
    const cleaned = cleanBrotherhoodName(interaction.options.getString("nume", true));
    if (!cleaned) return reply(interaction, "🏰 Numele are între 3 și 24 de caractere: litere, cifre, spații, apostrof sau cratimă.");
    await upsertPlayer(me, guildId, interaction.user.username);
    if (settings.createCost > 0 && !await tryDeductPlayerGold(me, guildId, settings.createCost)) {
      return reply(interaction, `🪙 O breaslă nouă costă **${settings.createCost.toLocaleString("ro-RO")}** Oboli.`);
    }
    const tag = cleanTag(interaction.options.getString("eticheta"), cleaned.name);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<Record<string, unknown>>(
        "INSERT INTO rpg_brotherhoods (guild_id, name, name_key, tag, leader_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (guild_id, name_key) DO NOTHING RETURNING *",
        [guildId, cleaned.name, cleaned.key, tag, me],
      );
      const joined = created.rows[0] ? await client.query(
        "INSERT INTO rpg_brotherhood_members (guild_id, discord_id, brotherhood_id, role) VALUES ($1, $2, $3, 'leader') ON CONFLICT DO NOTHING",
        [guildId, me, created.rows[0].id],
      ) : null;
      if (!created.rows[0] || !joined?.rowCount) {
        await client.query("ROLLBACK");
        if (settings.createCost > 0) await addPlayerGold(me, guildId, settings.createCost);
        return reply(interaction, created.rows[0] ? "🏰 Ai intrat deja într-o breaslă între timp." : "🏰 Există deja o breaslă cu numele ăsta.");
      }
      await client.query("COMMIT");
      return reply(interaction, `🏰 Ai întemeiat breasla **[${tag}] ${cleaned.name}**! Cheamă-ți tovarășii cu \`/breasla invita\`.`, await infoEmbed(guildId, fromRow(created.rows[0])));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (settings.createCost > 0) await addPlayerGold(me, guildId, settings.createCost);
      throw error;
    } finally {
      client.release();
    }
  }

  if (sub === "info") {
    const name = interaction.options.getString("nume");
    if (name) {
      const cleaned = cleanBrotherhoodName(name);
      const { rows } = cleaned ? await pool.query<Record<string, unknown>>("SELECT * FROM rpg_brotherhoods WHERE guild_id = $1 AND name_key = $2", [guildId, cleaned.key]) : { rows: [] };
      if (!rows[0]) return reply(interaction, "🏰 Nu există o breaslă cu numele ăsta.");
      return reply(interaction, "", await infoEmbed(guildId, fromRow(rows[0])));
    }
    if (!mine) return reply(interaction, "🏰 Nu ești în nicio breaslă. Fă una cu `/breasla creeaza` sau cere o invitație.");
    return reply(interaction, "", await infoEmbed(guildId, mine.brotherhood));
  }

  if (sub === "top") {
    const top = await brotherhoodTop(guildId, 10);
    const medals = ["🥇", "🥈", "🥉"];
    return reply(interaction, "", new EmbedBuilder().setColor(0xd94a2b).setTitle("🏰 Clasamentul breslelor (luna aceasta)")
      .setDescription(top.length ? top.map((row, index) => `${medals[index] ?? `**${index + 1}.**`} **[${row.tag}] ${row.name}** — ${row.points.toLocaleString("ro-RO")} puncte · ${row.members} membri`).join("\n") : "Încă nu există nicio breaslă. Întemeiază prima cu `/breasla creeaza`!"));
  }

  if (!mine) return reply(interaction, "🏰 Nu ești în nicio breaslă.");
  const brotherhood = mine.brotherhood;
  const canManage = mine.role === "leader" || mine.role === "officer";

  if (sub === "invita") {
    if (!canManage) return reply(interaction, "🏰 Doar liderul și ofițerii pot invita.");
    const target = interaction.options.getUser("jucator", true);
    if (target.bot || target.id === me) return reply(interaction, "🏰 Alege un alt jucător.");
    if (await membershipOf(guildId, target.id)) return reply(interaction, "🏰 Jucătorul e deja într-o breaslă.");
    if ((await members(brotherhood.id)).length >= settings.maxMembers) return reply(interaction, `🏰 Breasla e plină (${settings.maxMembers} membri).`);
    const id = `${interaction.id}`;
    invites.set(id, { brotherhoodId: brotherhood.id, guildId, inviterId: me, inviteeId: target.id, expiresAt: Date.now() + INVITE_MS });
    setTimeout(() => invites.delete(id), INVITE_MS + 5_000).unref?.();
    await interaction.editReply({ content: "📨 Invitația a fost trimisă în canal." });
    await interaction.followUp({
      content: `🏰 <@${target.id}>, ești chemat în breasla **[${brotherhood.tag}] ${brotherhood.name}** de <@${me}>!`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`brotherhood_join_${id}`).setLabel("Intră în breaslă").setEmoji("🏰").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`brotherhood_refuse_${id}`).setLabel("Refuză").setStyle(ButtonStyle.Secondary),
      )],
      allowedMentions: { users: [target.id] },
    });
    return;
  }

  if (sub === "paraseste") {
    const list = await members(brotherhood.id);
    if (mine.role === "leader" && list.length > 1) {
      const heir = list.find((member) => member.role === "officer") ?? list.find((member) => member.discordId !== me)!;
      await pool.query("UPDATE rpg_brotherhood_members SET role = 'leader' WHERE guild_id = $1 AND discord_id = $2", [guildId, heir.discordId]);
      await pool.query("UPDATE rpg_brotherhoods SET leader_id = $2 WHERE id = $1", [brotherhood.id, heir.discordId]);
    }
    await pool.query("DELETE FROM rpg_brotherhood_members WHERE guild_id = $1 AND discord_id = $2", [guildId, me]);
    if (list.length <= 1) {
      // The last one out takes the pantry with them.
      const { rows } = await pool.query<{ bank: number }>("DELETE FROM rpg_brotherhoods WHERE id = $1 RETURNING bank", [brotherhood.id]);
      if (Number(rows[0]?.bank ?? 0) > 0) await addPlayerGold(me, guildId, Number(rows[0]!.bank));
      return reply(interaction, `🏰 Ai închis breasla **${brotherhood.name}**${Number(rows[0]?.bank ?? 0) > 0 ? ` și ai luat cămara (${Number(rows[0]!.bank).toLocaleString("ro-RO")} Oboli)` : ""}.`);
    }
    return reply(interaction, `🏰 Ai părăsit breasla **${brotherhood.name}**.`);
  }

  if (sub === "doneaza") {
    const amount = Math.floor(interaction.options.getInteger("suma", true));
    if (amount <= 0) return reply(interaction, "🪙 Donează cel puțin un Obol.");
    if (!await tryDeductPlayerGold(me, guildId, amount)) return reply(interaction, `🪙 Nu ai **${amount.toLocaleString("ro-RO")}** Oboli.`);
    const { rows } = await pool.query<{ bank: number }>("UPDATE rpg_brotherhoods SET bank = bank + $2 WHERE id = $1 RETURNING bank", [brotherhood.id, amount]);
    if (!rows[0]) {
      await addPlayerGold(me, guildId, amount);
      return reply(interaction, "🏰 Breasla nu mai există.");
    }
    return reply(interaction, `🪙 Ai donat **${amount.toLocaleString("ro-RO")}** Oboli. În cămară sunt acum **${Number(rows[0].bank).toLocaleString("ro-RO")}**.`);
  }

  if (sub === "imparte") {
    if (mine.role !== "leader") return reply(interaction, "🏰 Doar liderul împarte din cămară.");
    const target = interaction.options.getUser("jucator", true);
    const amount = Math.floor(interaction.options.getInteger("suma", true));
    const theirs = await membershipOf(guildId, target.id);
    if (theirs?.brotherhood.id !== brotherhood.id) return reply(interaction, "🏰 Jucătorul nu e în breasla ta.");
    if (amount <= 0) return reply(interaction, "🪙 Alege o sumă.");
    const { rowCount } = await pool.query("UPDATE rpg_brotherhoods SET bank = bank - $2 WHERE id = $1 AND bank >= $2", [brotherhood.id, amount]);
    if (!rowCount) return reply(interaction, "🪙 Nu sunt atâția Oboli în cămară.");
    await addPlayerGold(target.id, guildId, amount);
    return reply(interaction, `🪙 I-ai dat lui <@${target.id}> **${amount.toLocaleString("ro-RO")}** Oboli din cămară.`);
  }

  if (sub === "exclude" || sub === "promoveaza") {
    const target = interaction.options.getUser("jucator", true);
    const theirs = await membershipOf(guildId, target.id);
    if (theirs?.brotherhood.id !== brotherhood.id || target.id === me) return reply(interaction, "🏰 Jucătorul nu e în breasla ta.");
    if (sub === "promoveaza") {
      if (mine.role !== "leader") return reply(interaction, "🏰 Doar liderul numește ofițeri.");
      const next: GuildRole = theirs.role === "officer" ? "member" : "officer";
      await pool.query("UPDATE rpg_brotherhood_members SET role = $3 WHERE guild_id = $1 AND discord_id = $2", [guildId, target.id, next]);
      return reply(interaction, next === "officer" ? `🛡️ <@${target.id}> e acum ofițer.` : `<@${target.id}> e din nou membru.`);
    }
    if (!canManage || theirs.role === "leader" || (mine.role === "officer" && theirs.role === "officer")) return reply(interaction, "🏰 Nu poți exclude acest membru.");
    await pool.query("DELETE FROM rpg_brotherhood_members WHERE guild_id = $1 AND discord_id = $2 AND brotherhood_id = $3", [guildId, target.id, brotherhood.id]);
    return reply(interaction, `🏰 <@${target.id}> nu mai face parte din breaslă.`);
  }
}

export async function handleBrotherhoodButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^brotherhood_(join|refuse)_(\d+)$/);
  if (!match || !interaction.guildId) return false;
  const invite = invites.get(match[2]!);
  if (!invite || invite.expiresAt < Date.now()) {
    await interaction.reply({ content: "⌛ Invitația a expirat.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== invite.inviteeId) {
    await interaction.reply({ content: "🏰 Invitația nu e pentru tine.", flags: MessageFlags.Ephemeral });
    return true;
  }
  invites.delete(match[2]!);
  if (match[1] === "refuse") {
    await interaction.update({ content: `🏳️ <@${invite.inviteeId}> a refuzat invitația.`, components: [], allowedMentions: { parse: [] } });
    return true;
  }
  await ensureTables();
  const settings = settingsOf(invite.guildId);
  // The join is one statement: it fails when the player is already in a brotherhood or this one is full.
  const { rowCount } = await pool.query(
    `INSERT INTO rpg_brotherhood_members (guild_id, discord_id, brotherhood_id, role)
     SELECT $1, $2, b.id, 'member' FROM rpg_brotherhoods b
     WHERE b.id = $3 AND (SELECT count(*) FROM rpg_brotherhood_members m WHERE m.brotherhood_id = b.id) < $4
     ON CONFLICT (guild_id, discord_id) DO NOTHING`,
    [invite.guildId, invite.inviteeId, invite.brotherhoodId, settings.maxMembers],
  );
  await upsertPlayer(invite.inviteeId, invite.guildId, interaction.user.username);
  await interaction.update({
    content: rowCount ? `🏰 <@${invite.inviteeId}> a intrat în breaslă!` : "🏰 Nu s-a putut: ești deja într-o breaslă sau breasla e plină.",
    components: [],
    allowedMentions: { parse: [] },
  });
  return true;
}
