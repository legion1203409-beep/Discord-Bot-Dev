import { Router, type ErrorRequestHandler, type IRouter } from "express";
import {
  AttackGameEncounterBody,
  AttackGameEncounterResponse,
  ChooseGameLevelUpBody,
  GameAuthConfigResponse,
  GetGameOverviewResponse,
  GetGameSessionResponse,
  JoinGameEncounterBody,
} from "@workspace/api-zod";
import {
  beginGameOAuth,
  isDiscordOAuthConfigured,
} from "../moderation/oauth";
import {
  assertGameCsrf,
  clearGamePlayerSessionCookie,
  GameAuthError,
  requireGamePlayerSession,
  requirePlayerGuild,
  revokePlayerSession,
} from "./auth";
import {
  beginGameAction,
  completeGameAction,
  failGameAction,
} from "./store";
import {
  getActiveEvent,
  getDailyQuestRows,
  getLatestActiveEvent,
  getParticipant,
  getPlayerItems,
  joinEvent,
  applyPendingParticipantLevelUp,
  upsertPlayer,
} from "../bot/db";
import { initGameplayConfig, isGameplayPaused, getGameplayConfig } from "../bot/gameplay-store";
import { dailyQuestDefinitions } from "../bot/survival";
import { BrowserCombatError, browserCombatAttack } from "../bot/browser-combat";
import { levelUpBonusValues } from "../bot/levelup";

const router: IRouter = Router();
const SNOWFLAKE = /^\d{5,25}$/;

function parseGuildId(value: string): string {
  if (!SNOWFLAKE.test(value)) throw new GameAuthError(400, "Invalid guild ID");
  return value;
}

function parseEventId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new GameAuthError(400, "Invalid encounter ID");
  }
  return id;
}

async function buildOverview(
  session: Awaited<ReturnType<typeof requireGamePlayerSession>>,
  guild: Awaited<ReturnType<typeof requirePlayerGuild>>,
) {
  await initGameplayConfig(guild.id);
  const [player, inventory, questRows, event] = await Promise.all([
    upsertPlayer(session.userId, guild.id, session.username),
    getPlayerItems(session.userId, guild.id),
    getDailyQuestRows(session.userId, guild.id),
    getLatestActiveEvent(guild.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const missions = Object.entries(dailyQuestDefinitions(getGameplayConfig(guild.id)))
    .map(([key, definition]) => {
      const row = questRows.find((item) =>
        item.questKey === key && item.questDate === today,
      );
      return {
        key,
        title: definition.label,
        description: definition.description,
        progress: row?.progress ?? 0,
        target: definition.target,
        completed: row?.completed ?? false,
        rewardGiven: row?.rewardGiven ?? false,
        rewardItemKey: definition.reward.itemKey,
        rewardQuantity: definition.reward.qty,
      };
    });

  const participant = event
    ? await getParticipant(event.id, guild.id, session.userId)
    : null;
  const paused = isGameplayPaused(guild.id);
  const encounter = event
    ? {
        id: event.id,
        type: event.eventType,
        expiresAt: event.expiresAt.toISOString(),
        joined: Boolean(participant),
        canJoin: !paused && !participant,
        canAttack: !paused
          && Boolean(participant?.isAlive)
          && !participant?.pendingLevelup,
        participant: participant
          ? {
              username: participant.username,
              monsterLevel: participant.monsterLevel,
              monsterRarity: participant.monsterRarity ?? "comun",
              currentHp: participant.currentHp,
              maxHp: participant.maxHp,
              monsterCurrentHp: participant.monsterCurrentHp,
              isAlive: participant.isAlive,
              pendingLevelup: participant.pendingLevelup,
              fled: participant.fled,
              totalDamage: participant.totalDamage,
              xp: participant.xp,
              oboli: participant.oboli,
            }
          : null,
      }
    : null;

  return GetGameOverviewResponse.parse({
    guild,
    player: {
      username: player.username,
      xp: player.xp,
      gold: player.gold,
      reputation: player.reputation,
      hp: player.hp,
      maxLevel: player.maxLevel,
      class: player.class,
      classLevel: player.classLevel,
      deaths: player.deaths,
      retreats: player.retreats,
      attackBonus: player.attackBonus,
      defenseBonus: player.defenseBonus,
      dodgeBonus: player.dodgeBonus,
      critBonus: player.critBonus,
      maxHpBonus: player.maxHpBonus,
      mana: player.mana,
      manaLevel: player.manaLevel,
      equippedWeapon: player.equippedWeapon,
      equippedArmor: player.equippedArmor,
    },
    inventory: inventory.map((item) => ({
      itemKey: item.itemKey,
      quantity: item.quantity,
      level: item.level,
    })),
    missions,
    encounter,
  });
}

function ensureCurrentEncounter(
  event: Awaited<ReturnType<typeof getActiveEvent>>,
): NonNullable<Awaited<ReturnType<typeof getActiveEvent>>> {
  if (!event || !event.isActive || event.expiresAt.getTime() <= Date.now()) {
    throw new GameAuthError(404, "The encounter is no longer active");
  }
  return event;
}

router.get("/auth-config", (_req, res): void => {
  res.json(GameAuthConfigResponse.parse({
    discordOAuthConfigured: isDiscordOAuthConfigured(),
    authorizationUrl: "/api/game/oauth/discord",
  }));
});

router.get("/oauth/discord", (_req, res): void => {
  try {
    res.redirect(beginGameOAuth(res));
  } catch {
    res.status(503).json({ error: "Discord OAuth is not configured" });
  }
});

router.get("/session", async (req, res): Promise<void> => {
  try {
    const session = await requireGamePlayerSession(req);
    res.json(GetGameSessionResponse.parse({
      authenticated: true,
      userId: session.userId,
      username: session.username,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
      guilds: session.guilds,
    }));
  } catch (error) {
    if (error instanceof GameAuthError && error.status === 401) {
      res.json(GetGameSessionResponse.parse({
        authenticated: false,
        userId: null,
        username: null,
        csrfToken: null,
        expiresAt: null,
        guilds: [],
      }));
      return;
    }
    throw error;
  }
});

router.post("/logout", async (req, res): Promise<void> => {
  const session = await requireGamePlayerSession(req);
  assertGameCsrf(req, session);
  await revokePlayerSession(session);
  clearGamePlayerSessionCookie(res);
  res.status(204).end();
});

router.get("/guilds/:guildId/overview", async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  const session = await requireGamePlayerSession(req);
  const guild = await requirePlayerGuild(session, guildId);
  res.json(await buildOverview(session, guild));
});

router.post("/guilds/:guildId/events/:eventId/join", async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  const eventId = parseEventId(req.params.eventId);
  const parsed = JoinGameEncounterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid action request" });
    return;
  }
  const session = await requireGamePlayerSession(req);
  assertGameCsrf(req, session);
  const guild = await requirePlayerGuild(session, guildId);
  await initGameplayConfig(guildId);
  if (isGameplayPaused(guildId)) {
    res.status(409).json({ error: "Gameplay is paused for this guild" });
    return;
  }
  ensureCurrentEncounter(await getActiveEvent(eventId, guildId));

  const claim = await beginGameAction({
    guildId,
    actorId: session.userId,
    eventId,
    idempotencyKey: parsed.data.idempotencyKey,
    actionType: "join",
  });
  if (!claim.action) throw new Error("Could not reserve the player action");
  if (!claim.created) {
    if (
      claim.action.eventId !== eventId
      || claim.action.actionType !== "join"
      || claim.action.status !== "completed"
    ) {
      res.status(409).json({ error: "This action key has already been used" });
      return;
    }
    res.json(await buildOverview(session, guild));
    return;
  }

  try {
    await upsertPlayer(session.userId, guildId, session.username);
    const participant = await joinEvent(guildId, eventId, session.userId, session.username);
    if (!participant) throw new GameAuthError(409, "Could not join the encounter");
    await completeGameAction(claim.action.id, { joined: true });
    res.json(await buildOverview(session, guild));
  } catch (error) {
    await failGameAction(claim.action.id);
    throw error;
  }
});

router.post("/guilds/:guildId/events/:eventId/attack", async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  const eventId = parseEventId(req.params.eventId);
  const parsed = AttackGameEncounterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid action request" });
    return;
  }
  const session = await requireGamePlayerSession(req);
  assertGameCsrf(req, session);
  const guild = await requirePlayerGuild(session, guildId);
  await initGameplayConfig(guildId);
  if (isGameplayPaused(guildId)) {
    res.status(409).json({ error: "Gameplay is paused for this guild" });
    return;
  }
  ensureCurrentEncounter(await getActiveEvent(eventId, guildId));

  const claim = await beginGameAction({
    guildId,
    actorId: session.userId,
    eventId,
    idempotencyKey: parsed.data.idempotencyKey,
    actionType: "attack",
  });
  if (!claim.action) throw new Error("Could not reserve the player action");
  if (!claim.created) {
    if (
      claim.action.eventId !== eventId
      || claim.action.actionType !== "attack"
      || claim.action.status !== "completed"
      || !claim.action.result
    ) {
      res.status(409).json({ error: "This action key has already been used" });
      return;
    }
    const overview = await buildOverview(session, guild);
    res.json(AttackGameEncounterResponse.parse({
      result: claim.action.result,
      overview,
    }));
    return;
  }

  try {
    const result = await browserCombatAttack(guildId, eventId, session.userId);
    await completeGameAction(claim.action.id, result);
    const overview = await buildOverview(session, guild);
    res.json(AttackGameEncounterResponse.parse({ result, overview }));
  } catch (error) {
    await failGameAction(claim.action.id);
    if (error instanceof BrowserCombatError) {
      throw new GameAuthError(error.status, error.message);
    }
    throw error;
  }
});

router.post("/guilds/:guildId/events/:eventId/level-up", async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  const eventId = parseEventId(req.params.eventId);
  const parsed = ChooseGameLevelUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid level-up choice" });
    return;
  }
  const session = await requireGamePlayerSession(req);
  assertGameCsrf(req, session);
  const guild = await requirePlayerGuild(session, guildId);
  await initGameplayConfig(guildId);
  if (isGameplayPaused(guildId)) {
    res.status(409).json({ error: "Gameplay is paused for this guild" });
    return;
  }
  ensureCurrentEncounter(await getActiveEvent(eventId, guildId));

  const participant = await getParticipant(eventId, guildId, session.userId);
  if (!participant || !participant.isAlive || !participant.pendingLevelup) {
    res.status(409).json({ error: "No level-up is waiting for this character" });
    return;
  }

  const updated = await applyPendingParticipantLevelUp(
    participant.id,
    levelUpBonusValues(participant, parsed.data.bonus),
  );
  if (!updated) {
    res.status(409).json({ error: "No level-up is waiting for this character" });
    return;
  }
  res.json(await buildOverview(session, guild));
});

const routeErrorHandler: ErrorRequestHandler = (error, req, res, _next): void => {
  if (error instanceof GameAuthError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ err: error }, "Browser RPG request failed");
  res.status(500).json({ error: "The game service could not complete the request" });
};

router.use(routeErrorHandler);

export default router;
