/*
 * Browser integration coverage for the moderation console.
 *
 * This file is intentionally outside src/ and is run by the repository's
 * Playwright project. The mocked session is test-only: production code still
 * obtains its HttpOnly session and CSRF token from the API.
 */
import { test, expect } from "@playwright/test";

const guilds = [
  { id: "111111111", name: "Cenușa Nordului", icon: null },
  { id: "222222222", name: "Turnul Gol", icon: null },
];

const rule = () => ({ enabled: false, action: "none", severity: "normal", thresholds: {} });
const fullConfig = () => ({
  protection: { enabled: true },
  autoMod: { enabled: false, wordFilter: rule(), linkBlock: rule(), emojiLimit: rule(), capsLimit: rule(), repeatBlock: rule(), forbiddenWords: [], forbiddenLinks: [] },
  antiRaid: { enabled: false, joinsPerMinute: 10, accountAgeDays: 7, lockdown: false, alertChannelId: null, rule: rule() },
  antiSpam: { enabled: false, message: rule(), edit: rule(), delete: rule(), mention: rule(), emoji: rule(), logChannelId: null },
  antiFlood: { enabled: false, longMessage: rule(), character: rule(), caps: rule(), symbol: rule() },
  manualTools: { enabled: false, commandGrants: {}, logActions: false },
  cases: { enabled: false, allowStaffClose: true, allowStaffNotes: true, allowStaffExport: false, retentionDays: 365 },
  audit: { enabled: false, detailLevel: "standard", channelId: null },
  activityLog: {
    enabled: false,
    categories: { messages: true, members: true, channels: true, roles: true, voice: true, moderation: true, security: true },
    roleIds: [],
    categoryId: null,
    channelIds: { messages: null, members: null, channels: null, roles: null, voice: null, moderation: null, security: null },
  },
  roles: { sanctionableRoleIds: [], protectedRoleIds: [], ignoredAutoModRoleIds: [], specialPermissionRoleIds: [] },
  channels: { ignoredChannelIds: [], protectedChannelIds: [], autoSlowmodeChannelIds: [], strictChannelIds: [], softChannelIds: [] },
  timeProfiles: {
    timezone: "UTC",
    strictNight: { enabled: false, startHour: 22, endHour: 7 },
    softDay: { enabled: false, startHour: 8, endHour: 21 },
    weekend: { enabled: false, severity: "normal" },
    majorEvent: { enabled: false, severity: "hard" },
  },
  suspiciousBehavior: {
    enabled: false, sensitivity: "medium", action: "none", alertChannelId: null,
    nicknameChanges: rule(), roleChanges: rule(), massEdits: rule(), massDeletes: rule(), joinLeaveFlood: rule(), unusualActivity: rule(),
  },
  ai: { enabled: false, sensitivity: "medium", tone: "calm", action: "none", logChannelId: null, categories: { toxicity: false, profanity: false, attacks: false, bullying: false, intelligentSpam: false, trolling: false } },
  multiServer: { enabled: false, isolatedData: true },
  escalation: { enabled: false, resetAfterDays: 30, levels: [{ level: 1, violations: 1, action: "warn" }] },
  embeds: { enabled: false, color: "#5865F2", iconUrl: null, titleTemplate: "Moderation action", descriptionTemplate: "{action}: {reason}", style: "plain", animations: false, animationUrl: null },
  bot: { prefix: "/" },
  permissions: { staffRoleIds: [], allowManageGuild: true, allowAdminsSettings: false },
});

const verificationBotControlConfig = (enabled: boolean, panelMessageId: string, discordLive = true) => ({
  channels: {},
  provisioningPermissions: {},
  allianceRecruitmentText: "",
  discordLive,
  verification: {
    enabled,
    channelId: "",
    roleId: "",
    title: "Verifică-ți contul",
    message: "Apasă butonul pentru verificare.",
    buttonLabel: "Verifică-mă",
    buttonEmoji: "✅",
    successMessage: "Verificare reușită.",
    alreadyVerifiedMessage: "Deja verificat.",
    imageUrl: "",
    thumbnailUrl: "",
    panelMessageId,
  },
});

async function installPartialBotControlFixture(
  page: import("@playwright/test").Page,
  configs: Map<string, ReturnType<typeof verificationBotControlConfig>>,
  createPartialResponse?: (body: any) => Record<string, unknown>,
) {
  const putBodies = new Map<string, any[]>();
  await page.route("**/api/moderation/auth-config", async (route) => {
    await route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } });
  });
  await page.route("**/api/moderation/session", async (route) => {
    await route.fulfill({
      json: { authenticated: true, userId: "999999999", guilds, csrfToken: "test-csrf", expiresAt: "2099-01-01T00:00:00.000Z" },
    });
  });
  await page.route("**/api/moderation/guilds/*/bot-control", async (route) => {
    const guildId = route.request().url().match(/guilds\/(\d+)\/bot-control/)?.[1] ?? guilds[0].id;
    if (route.request().method() !== "PUT") {
      await route.fulfill({ json: structuredClone(configs.get(guildId)!) });
      return;
    }
    const body = JSON.parse(route.request().postData() || "{}");
    const guildBodies = putBodies.get(guildId) ?? [];
    guildBodies.push(body);
    putBodies.set(guildId, guildBodies);
    if (guildId === guilds[0].id && guildBodies.length === 1 && createPartialResponse) {
      await route.fulfill({ status: 207, json: createPartialResponse(body) });
      return;
    }
    const canonical = { ...body, discordLive: configs.get(guildId)?.discordLive ?? true };
    configs.set(guildId, canonical);
    await route.fulfill({ json: canonical });
  });
  await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
    const guildId = route.request().url().match(/guilds\/(\d+)\/metadata/)?.[1] ?? guilds[0].id;
    await route.fulfill({
      json: {
        guild: { id: guildId, name: guilds.find((guild) => guild.id === guildId)?.name ?? guilds[0].name, ownerId: "999999999" },
        roles: [],
        channels: [],
        emojis: [],
        botCapabilities: { online: true, messageContent: true, guildMembers: true },
      },
    });
  });
  await page.route("**/api/moderation/guilds/*/verification/members", async (route) => {
    const guildId = route.request().url().match(/guilds\/(\d+)\/verification\/members/)?.[1] ?? guilds[0].id;
    await route.fulfill({ json: { guildId, roleId: "", roleName: null, total: 0, members: [] } });
  });
  return putBodies;
}

test.describe("authenticated moderation console", () => {
  const savedConfigs = new Map(guilds.map(({ id }) => [id, fullConfig()]));
  let actionBodies: unknown[] = [];

  test.beforeEach(async ({ page }) => {
    actionBodies = [];
    for (const guild of guilds) savedConfigs.set(guild.id, fullConfig());
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
    await page.route("**/api/moderation/session", async (route) => {
      await route.fulfill({ json: { authenticated: true, userId: "999999999", guilds, csrfToken: "test-csrf", expiresAt: "2099-01-01T00:00:00.000Z" } });
    });
    await page.route("**/api/moderation/guilds/*/config", async (route) => {
      const id = route.request().url().match(/guilds\/(\d+)\/config/)?.[1] || guilds[0].id;
      if (route.request().method() === "PUT") {
        expect(route.request().headers()["if-match"]).toBeTruthy();
        savedConfigs.set(id, JSON.parse(route.request().postData() || "{}"));
        await route.fulfill({ json: { config: savedConfigs.get(id), version: 2 }, headers: { ETag: '"2"' } });
        return;
      }
      await route.fulfill({ json: { config: savedConfigs.get(id), version: 1 }, headers: { ETag: '"1"' } });
    });
    await page.route("**/api/moderation/guilds/*/protection-toggle", async (route) => {
      const id = route.request().url().match(/guilds\/(\d+)\/protection-toggle/)?.[1] || guilds[0].id;
      const body = JSON.parse(route.request().postData() || "{}") as { key: string; enabled: boolean };
      const config: any = structuredClone(savedConfigs.get(id));
      if (body.key === "wordFilter" || body.key === "linkBlock") {
        config.autoMod[body.key].enabled = body.enabled;
        if (body.enabled) config.autoMod.enabled = true;
      } else {
        config[body.key].enabled = body.enabled;
      }
      savedConfigs.set(id, config);
      await route.fulfill({ json: { config, version: 3 }, headers: { ETag: '"3"' } });
    });
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      await route.fulfill({
        json: {
          guild: { id: guilds[0].id, name: guilds[0].name, ownerId: "999999999" },
          roles: [{ id: "333333333", name: "Moderatori", position: 2, managed: false }],
          channels: [{ id: "444444444", name: "audit", type: 0, parentId: null }],
          botCapabilities: { online: true, messageContent: true, guildMembers: true },
        },
      });
    });
    await page.route("**/api/moderation/guilds/*/cases**", async (route) => await route.fulfill({ json: { items: [] } }));
    await page.route("**/api/moderation/guilds/*/logs/audit**", async (route) => await route.fulfill({ json: { items: [] } }));
    await page.route("**/api/moderation/guilds/*/actions", async (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().headers()["idempotency-key"]).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
        actionBodies.push(JSON.parse(route.request().postData() || "{}"));
        await route.fulfill({ status: 201, json: { actionId: "action-1", summary: "Warn applied" } });
      } else {
        await route.fulfill({ json: { items: [] } });
      }
    });
  });

  async function chooseFirstGuild(page: import("@playwright/test").Page) {
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await page.getByRole("button", { name: guilds[0].name }).click();
  }

  async function expectNavGroupExpanded(page: import("@playwright/test").Page, groupId: string) {
    const group = page.getByTestId(`nav-group-${groupId}`);
    await expect(group).toBeVisible();
    await expect(group).not.toHaveAttribute("aria-expanded");
    await expect(page.locator(`#nav-group-${groupId}`)).toBeVisible();
  }

  test("keeps gameplay status unknown after GET failure, retries, and preserves guild-specific toggles", async ({ page }) => {
    const gameplayGets = new Map<string, number>();
    const gameplayPuts: Array<{ guildId: string; paused: boolean }> = [];
    const pausedByGuild = new Map([
      [guilds[0].id, false],
      [guilds[1].id, true],
    ]);
    await page.route("**/api/moderation/guilds/*/gameplay-state", async (route) => {
      const guildId = route.request().url().match(/guilds\/(\d+)\/gameplay-state/)?.[1] ?? guilds[0].id;
      if (route.request().method() === "GET") {
        const attempts = (gameplayGets.get(guildId) ?? 0) + 1;
        gameplayGets.set(guildId, attempts);
        if (guildId === guilds[0].id && attempts === 1) {
          await route.fulfill({ status: 503, json: { error: "Gameplay state temporarily unavailable" } });
          return;
        }
        await route.fulfill({ json: { paused: pausedByGuild.get(guildId) } });
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}") as { paused: boolean };
      gameplayPuts.push({ guildId, paused: body.paused });
      pausedByGuild.set(guildId, body.paused);
      await route.fulfill({ json: { paused: body.paused } });
    });

    await page.goto("/moderare");
    await chooseFirstGuild(page);

    await expect(page.getByRole("heading", { name: "Starea jocului nu este confirmată" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Nu am putut confirma starea jocului.");
    const gameToggle = page.getByTestId("button-gameplay-state-toggle");
    await expect(gameToggle).toBeDisabled();
    await expect(gameToggle).not.toHaveText("Oprește jocul");

    await page.getByTestId("button-gameplay-state-retry").click();
    await expect(page.getByRole("heading", { name: "Regatul rulează normal" })).toBeVisible();
    await expect(gameToggle).toBeEnabled();

    page.once("dialog", (dialog) => dialog.accept());
    await gameToggle.click();
    await expect(page.getByRole("heading", { name: "Activitățile sunt oprite" })).toBeVisible();
    await gameToggle.click();
    await expect(page.getByRole("heading", { name: "Regatul rulează normal" })).toBeVisible();
    expect(gameplayPuts).toEqual([
      { guildId: guilds[0].id, paused: true },
      { guildId: guilds[0].id, paused: false },
    ]);

    const guildSelector = page.getByRole("combobox").first();
    await guildSelector.click();
    await page.getByRole("option", { name: guilds[1].name }).click();
    await expect(page.getByRole("heading", { name: "Activitățile sunt oprite" })).toBeVisible();
    await expect(gameToggle).toBeEnabled();
    expect(gameplayGets.get(guilds[1].id)).toBe(1);

    await guildSelector.click();
    await page.getByRole("option", { name: guilds[0].name }).click();
    await expect(page.getByRole("heading", { name: "Regatul rulează normal" })).toBeVisible();
    expect(gameplayGets.get(guilds[0].id)).toBe(3);
  });

  test("dashboard sections stack cleanly at a 1024px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await expect(page).toHaveURL("/moderare");
    await chooseFirstGuild(page);

    const columns = page.getByTestId("dashboard-columns");
    await expect(columns).toBeVisible();
    await expect(page.getByRole("heading", { name: "Module de Protecție" })).toBeVisible();
    await expect(page.getByTestId("card-module-autoMod")).toBeVisible();
    await expect(columns).toHaveCSS("opacity", "1");
    await columns.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/moderation-dashboard-1024px.png" });
    const sections = columns.locator(":scope > section");
    const modules = await sections.nth(0).boundingBox();
    const activity = await sections.nth(1).boundingBox();
    const firstModuleCard = await page.getByTestId("card-module-autoMod").boundingBox();

    expect(modules?.width).toBeGreaterThan(500);
    expect(activity?.width).toBeGreaterThan(500);
    expect(Math.abs(activity!.x - modules!.x)).toBeLessThan(1);
    expect(activity!.y).toBeGreaterThan(modules!.y + modules!.height);
    expect(firstModuleCard?.width).toBeGreaterThan(500);
  });

  test("AI settings persist after explicit save and reload", async ({ page }) => {
    await page.goto("/moderare/ai");
    await chooseFirstGuild(page);

    const switches = page.getByRole("switch");
    const aiEnabled = switches.nth(0);
    const toxicityEnabled = switches.nth(1);
    await expect(aiEnabled).not.toBeChecked();
    await aiEnabled.click();
    await toxicityEnabled.click();
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    expect(savedConfigs.get(guilds[0].id)?.ai.enabled).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.ai.categories.toxicity).toBe(true);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Moderare AI", exact: true })).toBeVisible();
    await expect(page.getByRole("switch").nth(0)).toBeChecked();
    await expect(page.getByRole("switch").nth(1)).toBeChecked();
  });

  test("renders every moderation destination instead of the work-in-progress fallback", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/moderare");
    await expect(page.locator(".hero-section")).toHaveCount(0);
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cenușa Nordului" })).toBeVisible();
    await page.screenshot({ path: "/tmp/moderation-dashboard-desktop.png", fullPage: true });
    const destinations = [
      {
        group: "protection",
        routes: ["/protectie", "/automod", "/ai", "/anti-raid", "/anti-spam", "/anti-flood", "/comportament-suspect"],
      },
      {
        group: "moderation",
        routes: ["/politici", "/comenzi", "/cazuri", "/audit"],
      },
      {
        group: "configuration",
        routes: ["/config", "/config/avansat", "/config/unelte", "/config/cazuri-audit", "/config/escaladare", "/config/embeduri"],
      },
    ];
    for (const destinationGroup of destinations) {
      await expectNavGroupExpanded(page, destinationGroup.group);
      for (const path of destinationGroup.routes) {
        await page.locator(`nav[aria-label="Categorii de moderare"] a[href="/moderare${path}"]`).click();
        await expect(page).toHaveURL(`/moderare${path}`);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.getByText("Această secțiune este în lucru.")).toHaveCount(0);
      }
    }

    await expectNavGroupExpanded(page, "bot-control");
    const channelLink = page.locator('nav[aria-label="Categorii de moderare"] a[href="/moderare/canale"]');
    await channelLink.click();
    await expect(page).toHaveURL("/moderare/canale");
    await expect(channelLink).toHaveAttribute("aria-current", "page");
    for (const tab of ["tickets", "messages", "statistics"]) {
      const link = page.locator(`nav[aria-label="Categorii de moderare"] a[href="/moderare/bot?tab=${tab}"]`);
      await link.click();
      await expect(page).toHaveURL(`/moderare/bot?tab=${tab}`);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(page.locator('nav[aria-label="Categorii de moderare"] a[aria-current="page"]')).toHaveCount(1);
    }
    // A separate test-only bot-control GET lets us verify the role tab itself;
    // sidebar navigation above is independent of whether that API is online.
    let savedInviteLogChannel = "";
    let savedDailyStatsChannel = "";
    let savedMainChannel = "";
    await page.route("**/api/moderation/guilds/*/bot-control", async (route) => {
      if (route.request().method() === "PUT") {
        const body = JSON.parse(route.request().postData() || "{}");
        savedInviteLogChannel = body.inviteTracking.joinLogChannelId;
        savedDailyStatsChannel = body.dailyStats.channelId;
        savedMainChannel = body.channels.main;
        await route.fulfill({ json: { ...body, discordLive: true } });
        return;
      }
      await route.fulfill({ json: {
        channels: {}, provisioningPermissions: {}, discordLive: true,
        verification: {
          enabled: false, channelId: "", roleId: "", title: "", message: "", buttonLabel: "",
          buttonEmoji: "", successMessage: "", alreadyVerifiedMessage: "", imageUrl: "", thumbnailUrl: "", panelMessageId: "",
        },
        gameplayConfig: {
          memberMessages: { channelId: "", style: "normal", welcomeEnabled: false, leaveEnabled: false, customStyle: "" },
          messages: { gamePaused: "", gamePausedImageUrl: "", gamePausedThumbnailUrl: "", oraclePaused: "", oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "" },
          events: {}, missions: {}, economy: {},
        },
        allianceRecruitmentText: "",
        dailyStats: {
          channelId: "", title: "Statistici {guild}", description: "Raport {date}", color: "#5865F2", footer: "",
          activityTitle: "Activitate · ultimele 7 zile", channelsTitle: "Top 5 canale active",
          emptyChannelsText: "Nu există canale active.", imageUrl: "", thumbnailUrl: "",
          metricLabels: { messages: "Mesaje", uniqueUsers: "Utilizatori unici", boosts: "Boost-uri", joins: "Intrări", leaves: "Ieșiri", peakVoice: "Vârf vocal" },
        },
        inviteTracking: { enabled: false, joinLogChannelId: "", reportEnabled: false, reportChannelId: "", reportFrequency: "daily", reportTime: "09:00", reportTimeZone: "UTC", reportTopLimit: 5, reportWeekday: 1 },
        tickets: {
          categories: { staff: "", partnership: "", help_report: "" },
          allianceAnnouncementTemplate: "", allianceAnnouncementMode: "text",
          staffReviewRoleId: "", alliancePublicChannelId: "", allianceOwnerGuildId: "",
          flows: {
            staff: { questions: [], title: "", panelDescription: "", startButtonLabel: "", requirementsText: "", completionMessage: "", completionAction: "none" },
            partnership: { questions: [], title: "", panelDescription: "", startButtonLabel: "", requirementsText: "", completionMessage: "", completionAction: "none" },
            help_report: { questions: [], title: "", panelDescription: "", startButtonLabel: "", requirementsText: "", completionMessage: "", completionAction: "none" },
          },
        },
      } });
    });
    await page.route("**/api/moderation/guilds/*/invite-stats**", async (route) => {
      await route.fulfill({ json: {
        range: "7", startDay: "2026-09-18", endDay: "2026-09-24",
        totals: { attributedJoins: 0, unknownJoins: 0 }, rows: [],
      } });
    });
    await page.goto("/moderare/bot?tab=roles");
    await expect(page.getByTestId("tab-roles")).toHaveAttribute("data-state", "active");
    await page.getByTestId("tab-roles").click();
    await expect(page).toHaveURL("/moderare/bot?tab=roles");
    await expect(page.getByTestId("tab-roles")).toHaveAttribute("data-state", "active");

    await page.goto("/moderare/canale");
    await expect(page.getByRole("heading", { name: "Canale Discord", exact: true })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Identifică destinațiile pe Discord" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Creează ce lipsește" })).toBeDisabled();
    await page.getByLabel("Cufere ID").fill("555555555");
    const channelSave = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează setările canalelor" }).click();
    await expect((await channelSave).ok()).toBeTruthy();
    expect(savedMainChannel).toBe("555555555");

    await page.goto("/moderare/bot?tab=channels");
    await expect(page).toHaveURL("/moderare/canale");
    await expect(page.getByRole("heading", { name: "Canale Discord", exact: true })).toBeVisible();

    await page.goto("/moderare/bot?tab=roles");
    await expect(page.getByTestId("tab-roles")).toHaveAttribute("data-state", "active");
    await page.getByTestId("tab-statistics").click();
    await expect(page.getByText("Jurnal pentru fiecare intrare")).toBeVisible();
    await expect(page.getByText("PREVIZUALIZARE EMBED")).toBeVisible();
    await expect(page.getByText("Activitate · ultimele 7 zile").last()).toBeVisible();
    await expect(page.getByText("Top 5 canale active").last()).toBeVisible();
    await page.getByRole("switch", { name: "Activează colectarea statisticilor invitațiilor" }).click();
    const inviteLogChannel = page.locator("label").filter({ hasText: "Canal jurnal invitații" }).getByRole("combobox");
    await inviteLogChannel.click();
    await page.getByRole("option", { name: "#audit" }).click();
    await page.getByRole("combobox", { name: "Canal raport zilnic" }).click();
    await page.getByRole("option", { name: "#audit" }).click();
    const configSave = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează controlul botului" }).click();
    await expect((await configSave).ok()).toBeTruthy();
    expect(savedInviteLogChannel).toBe("444444444");
    expect(savedDailyStatsChannel).toBe("444444444");

    await page.locator('nav[aria-label="Categorii de moderare"] a[href="/moderare/verificare"]').click();
    await expect(page).toHaveURL("/moderare/verificare");
    await expect(page.locator('nav[aria-label="Categorii de moderare"] a[aria-current="page"]')).toHaveAttribute("href", "/moderare/verificare");
  });

  test("shows audit event labels and details from the API contract", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.unroute("**/api/moderation/guilds/*/logs/audit**");
    await page.route("**/api/moderation/guilds/*/logs/audit**", async (route) => {
      const items = [
            {
              id: "audit-config-1",
              guildId: guilds[0].id,
              actorId: null,
              eventType: "config.updated",
              targetType: "config",
              targetId: guilds[0].id,
              detail: { version: 3, protectionToggle: "antiRaid", enabled: true },
              createdAt: "2026-09-24T17:57:00.000Z",
            },
            {
              id: "audit-action-1",
              guildId: guilds[0].id,
              actorId: "999999999",
              eventType: "action.applied",
              targetType: "member",
              targetId: "555555555",
              detail: { type: "mute", summary: "Timeout de 10 minute aplicat lui <@555555555>.", source: "automod" },
              createdAt: "2026-09-24T17:37:00.000Z",
            },
            {
              id: "audit-ai-1",
              guildId: guilds[0].id,
              actorId: null,
              eventType: "ai.flagged",
              targetType: "message",
              targetId: "message-123",
              detail: { category: "toxicity" },
              createdAt: "2026-09-24T17:19:00.000Z",
            },
      ];
      const search = new URL(route.request().url()).searchParams.get("search")?.trim().toLowerCase();
      const matching = search === "toxicitate"
        ? items.filter((item) => item.eventType === "ai.flagged")
        : items;
      await route.fulfill({ json: { items: matching, total: matching.length } });
    });

    await page.goto("/moderare");
    await chooseFirstGuild(page);

    const configRow = page.getByTestId("row-dashboard-audit-0");
    await expect(configRow).toContainText("Configurație actualizată");
    await expect(configRow).toContainText("Anti-Raid a fost activat.");
    const actionRow = page.getByTestId("row-dashboard-audit-1");
    await expect(actionRow).toContainText("Acțiune aplicată");
    await expect(actionRow).toContainText("Timeout de 10 minute aplicat");
    const aiRow = page.getByTestId("row-dashboard-audit-2");
    await expect(aiRow).toContainText("Mesaj semnalat de moderarea AI");
    await expect(aiRow).toContainText("Categorie detectată: toxicitate.");
    await expect(page.getByText("Fără detalii suplimentare")).toHaveCount(0);
    await expect(page.getByText("a declanșat")).toHaveCount(0);

    await page.getByTestId("link-dashboard-audit").click();
    await expect(page).toHaveURL("/moderare/audit");
    await expect(page.getByText("Configurație actualizată")).toBeVisible();
    await expect(page.getByText("Anti-Raid a fost activat.")).toBeVisible();
    await page.getByPlaceholder("Caută în audit (acțiune, actor)...").fill("toxicitate");
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toBeVisible();
    await expect(page.getByText("Configurație actualizată")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Categorie" }).click();
    await page.getByRole("option", { name: "Securitate", exact: true }).click();
    // Use the browser's local timezone, as datetime-local does.
    const localInput = await page.evaluate(() => {
      const date = new Date("2026-09-24T17:19:00Z");
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    });
    await page.getByLabel("De la", { exact: true }).fill(localInput);
    await page.getByLabel("Până la", { exact: true }).fill(localInput);
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toBeVisible();
    await page.getByLabel("De la", { exact: true }).fill("2099-01-01T00:00");
    await expect(page.getByRole("alert")).toContainText("Data de început");
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toHaveCount(0);
    await page.getByRole("button", { name: "Elimină intervalul" }).click();
    await expect(page.getByLabel("De la", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Până la", { exact: true })).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Categorie" })).toContainText("Securitate");
    await expect(page.getByPlaceholder("Caută în audit (acțiune, actor)...")).toHaveValue("toxicitate");
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Până la", { exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/audit-date-range-mobile.png", fullPage: true });
  });

  test("switches guilds without displaying stale config and persists a full save", async ({ page }) => {
    await page.goto("/moderare/config/avansat");
    await chooseFirstGuild(page);
    await expect(page.getByRole("combobox").first()).toContainText("Cenușa Nordului");
    const guildSelector = page.getByRole("combobox").first();
    await guildSelector.click();
    await page.getByRole("option", { name: "Turnul Gol" }).click();
    await expect(page.getByRole("combobox").first()).toContainText("Turnul Gol");

    await expect(page.getByLabel("Canal audit ID fallback")).toHaveValue("");
    await page.getByLabel("Canal audit ID fallback").fill("444444444");
    const saveResponse = page.waitForResponse((response) => response.url().includes("/api/moderation/guilds/222222222/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează configurația" }).click();
    await expect((await saveResponse).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel("Canal audit ID fallback")).toHaveValue("444444444");
  });

  test("configuration cards navigate separately and toggles persist without navigation", async ({ page }) => {
    await page.goto("/moderare/config");
    await chooseFirstGuild(page);
    const autoModSwitch = page.getByRole("switch", { name: "Activează AutoMod" });
    await expect(autoModSwitch).not.toBeChecked();
    const toggleResponse = page.waitForResponse((response) => response.url().includes("/protection-toggle") && response.request().method() === "PUT");
    await autoModSwitch.click();
    await expect((await toggleResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL("/moderare/config");
    await expect(autoModSwitch).toBeChecked();
    await page.reload();
    await expect(page.getByRole("switch", { name: "Dezactivează AutoMod" })).toBeChecked();
    await page.getByRole("link", { name: /AutoMod/ }).first().click();
    await expect(page).toHaveURL("/moderare/automod");
    await expect(page.getByText("Discord AutoMod nativ:")).toBeVisible();
  });

  test("category save reapplies only its fields to the latest server snapshot", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);

    await page.getByLabel("Cuvinte interzise").fill("valoare-salvată");

    // Simulate an independent dashboard writer after this editor loaded. A
    // category save must not put its older full snapshot over that change.
    const concurrentlyUpdated = structuredClone(savedConfigs.get(guilds[0].id)!);
    concurrentlyUpdated.antiRaid.enabled = true;
    concurrentlyUpdated.audit.detailLevel = "verbose";
    savedConfigs.set(guilds[0].id, concurrentlyUpdated);

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect((await saveResponse).ok()).toBeTruthy();

    expect(savedConfigs.get(guilds[0].id)?.autoMod.forbiddenWords).toEqual(["valoare-salvată"]);
    expect(savedConfigs.get(guilds[0].id)?.antiRaid.enabled).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.audit.detailLevel).toBe("verbose");
    expect(savedConfigs.get(guilds[1].id)?.autoMod.forbiddenWords).toEqual([]);

    await page.reload();
    await expect(page.getByLabel("Cuvinte interzise")).toHaveValue("valoare-salvată");
  });

  test("saves an enabled module and rule, then rehydrates both after reload", async ({ page }) => {
    await page.goto("/moderare/anti-raid");
    await chooseFirstGuild(page);

    await page.getByRole("switch", { name: "Activează anti-raid" }).click();
    await page.getByRole("switch", { name: "Regulă activă" }).click();
    await page.getByLabel("Intrări pe minut").fill("24");

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează" }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.antiRaid).toMatchObject({
      enabled: true,
      rule: { enabled: true },
      joinsPerMinute: 24,
    });

    await page.reload();
    await expect(page.getByRole("switch", { name: "Activează anti-raid" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Regulă activă" })).toBeChecked();
    await expect(page.getByLabel("Intrări pe minut")).toHaveValue("24");
  });

  test("rejects an active activity log without a viewing role and preserves the draft", async ({ page }) => {
    const configPuts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/moderation/guilds/111111111/config") && request.method() === "PUT") {
        configPuts.push(request.url());
      }
    });
    await page.goto("/moderare/config/cazuri-audit");
    await chooseFirstGuild(page);
    const logToggle = page.getByRole("switch", { name: "Activează jurnalizarea serverului" });
    await logToggle.click();

    await expect(page.getByRole("alert")).toContainText("Selectează cel puțin un rol care poate vedea canalele private de jurnal.");
    await page.getByRole("button", { name: "Salvează" }).click();

    expect(configPuts).toEqual([]);
    await expect(logToggle).toBeChecked();
    await expect(page.getByRole("button", { name: "Salvează" })).toBeVisible();
  });

  test("rejects an invalid animation GIF URL and preserves the draft", async ({ page }) => {
    const configPuts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/moderation/guilds/111111111/config") && request.method() === "PUT") {
        configPuts.push(request.url());
      }
    });
    await page.goto("/moderare/config/embeduri");
    await chooseFirstGuild(page);
    const animationToggle = page.getByRole("switch", { name: "Activează animațiile" });
    await animationToggle.click();
    const animationUrl = page.getByLabel("URL animație GIF");
    await animationUrl.fill("https://example.com/not-a-gif.png");

    await expect(page.getByRole("alert")).toContainText("URL-ul animației trebuie să fie un link HTTPS public către un fișier .gif");
    await page.getByRole("button", { name: "Salvează" }).click();

    expect(configPuts).toEqual([]);
    await expect(animationToggle).toBeChecked();
    await expect(animationUrl).toHaveValue("https://example.com/not-a-gif.png");
    await expect(page.getByRole("button", { name: "Salvează" })).toBeVisible();
  });

  test("keeps category edits visible after the server rejects the save", async ({ page }) => {
    await page.route("**/api/moderation/guilds/111111111/config", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 503, json: { error: "Setările nu au putut fi salvate." } });
    });
    await page.goto("/moderare/anti-raid");
    await chooseFirstGuild(page);
    const joinsPerMinute = page.getByLabel("Intrări pe minut");
    await joinsPerMinute.fill("24");
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page.getByText("Salvarea a eșuat")).toBeVisible();
    await expect(joinsPerMinute).toHaveValue("24");
    await expect(page.getByRole("button", { name: "Salvează" })).toBeVisible();
    expect(savedConfigs.get(guilds[0].id)?.antiRaid.joinsPerMinute).toBe(10);
  });

  test("automatic Discord log activation sends its category and keeps provisioned IDs after reload", async ({ page }) => {
    await page.goto("/moderare/config/cazuri-audit");
    await chooseFirstGuild(page);
    const logToggle = page.getByRole("switch", { name: "Activează jurnalizarea serverului" });
    await logToggle.click();
    await page.getByRole("switch", { name: /@Moderatori/ }).click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează" }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.activityLog).toMatchObject({
      enabled: true, roleIds: ["333333333"],
    });
    await page.reload();
    await expect(logToggle).toBeChecked();
    await expect(page.getByRole("switch", { name: /@Moderatori/ })).toBeChecked();
  });

  test("category draft edits during an in-flight save remain unsaved instead of being replaced", async ({ page }) => {
    let releaseSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
    await page.route("**/api/moderation/guilds/111111111/config", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      const config = JSON.parse(route.request().postData() || "{}");
      savedConfigs.set(guilds[0].id, config);
      await pendingSave;
      await route.fulfill({ json: { config, version: 2 }, headers: { ETag: '"2"' } });
    });
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    const words = page.getByLabel("Cuvinte interzise");
    await words.fill("prima");
    const request = page.waitForRequest((item) =>
      item.url().includes("/guilds/111111111/config") && item.method() === "PUT");
    await page.getByRole("button", { name: "Salvează" }).click();
    await request;
    await words.fill("a doua");
    releaseSave();
    await expect(words).toHaveValue("a doua");
    await expect(page.getByRole("button", { name: "Salvează" })).toBeVisible();
    expect(savedConfigs.get(guilds[0].id)?.autoMod.forbiddenWords).toEqual(["prima"]);
  });

  test("failed Discord log activation shows failure and does not claim a live log", async ({ page }) => {
    await page.route("**/api/moderation/guilds/111111111/config", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 503, json: { error: "Botul nu poate crea canalele de jurnal." } });
    });
    await page.goto("/moderare/config/cazuri-audit");
    await chooseFirstGuild(page);
    await page.getByRole("switch", { name: "Activează jurnalizarea serverului" }).click();
    await page.getByRole("switch", { name: /@Moderatori/ }).click();
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByText("Salvarea a eșuat")).toBeVisible();
    // The attempted activation is still an unsaved draft; only the persisted
    // fixture stays off after the server rejects the request.
    await expect(page.getByRole("switch", { name: "Activează jurnalizarea serverului" })).toBeChecked();
    expect(savedConfigs.get(guilds[0].id)?.activityLog.enabled).toBe(false);
  });

  test("spam window edit replaces conflicting aliases with the engine's preferred key", async ({ page }) => {
    const config = fullConfig();
    config.antiSpam.message.thresholds = { windowMs: 5, window: 9, limit: 3 };
    savedConfigs.set(guilds[0].id, config);
    await page.goto("/moderare/anti-spam");
    await chooseFirstGuild(page);
    await page.getByLabel("Fereastră (secunde)").first().fill("12");
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    expect(savedConfigs.get(guilds[0].id)?.antiSpam.message.thresholds).toEqual({ windowMs: 12, limit: 3 });
  });

  test("switching guilds discards the previous guild's unsaved category draft", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    await page.getByLabel("Cuvinte interzise").fill("nesalvat nord");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[1].name }).click();
    await expect(page.getByLabel("Cuvinte interzise")).toHaveValue("");
    await page.getByLabel("Cuvinte interzise").fill("salvat sud");
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[0].name }).click();
    await expect(page.getByLabel("Cuvinte interzise")).toHaveValue("");
    expect(savedConfigs.get(guilds[0].id)?.autoMod.forbiddenWords).toEqual([]);
    expect(savedConfigs.get(guilds[1].id)?.autoMod.forbiddenWords).toEqual(["salvat sud"]);
  });

  test("shows stored module state as paused when global protection is off", async ({ page }) => {
    const config = fullConfig();
    config.protection.enabled = false;
    config.antiRaid.enabled = true;
    savedConfigs.set(guilds[0].id, config);
    await page.goto("/moderare/config");
    await chooseFirstGuild(page);
    await expect(page.getByText("Protecția globală este oprită.")).toBeVisible();
    await expect(page.getByText("Activat, dar în pauză globală").first()).toBeVisible();
    await expect(page.getByRole("switch", { name: "Dezactivează Anti-Raid" })).toBeChecked();
  });

  test("overview module cards navigate while their toggles stay put and persist per guild", async ({ page }) => {
    await page.goto("/moderare");
    await chooseFirstGuild(page);

    const suspiciousSwitch = page.getByRole("switch", { name: "Activează Comportament suspect" });
    const toggleResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/protection-toggle")
      && response.request().method() === "PUT");
    await suspiciousSwitch.click();
    await expect((await toggleResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL("/moderare");
    await expect(page.getByRole("switch", { name: "Dezactivează Comportament suspect" })).toBeChecked();

    await page.getByTestId("link-module-suspiciousBehavior").click();
    await expect(page).toHaveURL("/moderare/comportament-suspect");
    await expect(page.getByRole("heading", { name: "Comportament suspect", exact: true })).toBeVisible();

    await page.goto("/moderare");
    await expect(page.getByRole("switch", { name: "Dezactivează Comportament suspect" })).toBeChecked();
    const guildSelector = page.getByRole("combobox").first();
    await guildSelector.click();
    await page.getByRole("option", { name: "Turnul Gol" }).click();
    await expect(page.getByRole("switch", { name: "Activează Comportament suspect" })).not.toBeChecked();
  });

  test("overview shows stored subrule toggles while global or AutoMod parents are off", async ({ page }) => {
    const config = fullConfig();
    config.protection.enabled = false;
    config.autoMod.enabled = false;
    config.autoMod.wordFilter.enabled = true;
    savedConfigs.set(guilds[0].id, config);

    await page.goto("/moderare");
    await chooseFirstGuild(page);
    const wordCard = page.getByTestId("card-module-wordFilter");
    await expect(wordCard.getByText("CONFIGURAT · PROTECȚIA GLOBALĂ OPRITĂ")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Dezactivează Filtru cuvinte" })).toBeChecked();

    const protectionResponse = page.waitForResponse((response) =>
      response.url().includes("/protection-toggle") && response.request().method() === "PUT");
    await page.getByRole("switch", { name: "Activează sau oprește toată protecția" }).click();
    await expect((await protectionResponse).ok()).toBeTruthy();
    await expect(wordCard.getByText("CONFIGURAT · AUTOMOD OPRIT")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Dezactivează Filtru cuvinte" })).toBeChecked();
  });

  test("supports mobile navigation without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/moderare");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cenușa Nordului" })).toBeVisible();
    await page.getByRole("button", { name: "Deschide meniul" }).click();
    await expectNavGroupExpanded(page, "protection");
    await page.getByTestId("link-nav-anti-flood").click();
    await expect(page).toHaveURL("/moderare/anti-flood");
    await expect(page.getByRole("button", { name: "Deschide meniul" })).toBeVisible();
    await page.screenshot({ path: "/tmp/moderation-dashboard-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("submits manual commands to the real action endpoint and displays its result", async ({ page }) => {
    await page.goto("/moderare/comenzi");
    await chooseFirstGuild(page);
    await page.getByLabel("ID Utilizator (Țintă)").fill("555555555");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Execută Comanda" }).click();
    await expect(page.getByTestId("manual-action-result")).toContainText("Warn applied");
    expect(actionBodies).toEqual([{ type: "warn", targetId: "555555555" }]);
  });

  for (const command of [
    { type: "purge", option: "Șterge Mesaje (Purge)", label: "Număr de mesaje de șters", amount: 25 },
    { type: "slowmode", option: "Setează Slowmode", label: "Slowmode (secunde, 0 = oprit)", amount: 0 },
  ]) {
    test(`executes ${command.type} with the chosen channel and exact amount`, async ({ page }) => {
      await page.goto("/moderare/comenzi");
      await chooseFirstGuild(page);
      await page.getByLabel("Tipul Acțiunii").click();
      await page.getByRole("option", { name: command.option }).click();
      await page.getByLabel("Canal - ID canal").fill("444444444");
      await page.getByLabel(command.label).fill(String(command.amount));
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Execută Comanda" }).click();
      await expect(page.getByTestId("manual-action-result")).toBeVisible();
      expect(actionBodies).toEqual([{ type: command.type, channelId: "444444444", amount: command.amount }]);
    });
  }
});

test.describe("Discord moderation authentication", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/moderation/session", async (route) => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
  });

  test("shows the Discord login and maps callback errors in Romanian", async ({ page }) => {
    await page.goto("/?auth_error=state_mismatch");
    await expect(page).toHaveURL("/moderare?auth_error=state_mismatch");
    await expect(page.getByTestId("discord-login-button")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Sesiunea de autentificare a expirat");
  });

  test("explains when the callback account has no eligible guild", async ({ page }) => {
    await page.goto("/moderare?auth_error=no_eligible_guild");
    await expect(page.getByRole("alert")).toContainText("botul este membru pe server");
    await expect(page.getByRole("alert")).toContainText("rol de staff sau administrator");
  });

  test("offers a real bot invite next to login without redirecting through the site", async ({ page }) => {
    const inviteUrl = "https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot+applications.commands&permissions=268504064";
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: {
        discordOAuthConfigured: true,
        authorizationUrl: "/api/moderation/oauth/discord",
        botInviteUrl: inviteUrl,
      } });
    });
    await page.goto("/moderare?auth_error=no_eligible_guild");
    const invite = page.getByRole("link", { name: "Invită botul pe server" });
    await expect(invite).toHaveAttribute("href", inviteUrl);
    await expect(invite).toHaveAttribute("target", "_blank");
    await expect(invite).toHaveAttribute("rel", /noopener.*noreferrer/);
    await expect(page.getByTestId("discord-login-button")).toBeVisible();
  });

  test("uses a safe fallback for an unknown callback error", async ({ page }) => {
    await page.goto("/moderare?auth_error=unexpected_internal_detail");
    await expect(page.getByRole("alert")).toContainText("Autentificarea Discord nu a putut fi finalizată");
    await expect(page.getByRole("alert")).not.toContainText("unexpected_internal_detail");
  });

  test("uses a top-level navigation to the same-origin OAuth start endpoint", async ({ page }) => {
    await page.route("**/api/moderation/oauth/discord", async (route) => {
      await route.fulfill({ status: 204 });
    });
    await page.goto("/moderare");
    const oauthRequest = page.waitForRequest("**/api/moderation/oauth/discord");
    await page.getByTestId("discord-login-button").click();
    await expect((await oauthRequest).url()).toContain("/api/moderation/oauth/discord");
  });

  test("explains when Discord OAuth is not configured", async ({ page }) => {
    await page.unroute("**/api/moderation/auth-config");
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: false, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
    await page.goto("/moderare");
    await expect(page.getByRole("status")).toContainText("Autentificarea Discord nu este disponibilă");
    await expect(page.getByTestId("discord-login-button")).toHaveCount(0);
  });
});

test.describe("verification panel partial applies", () => {
  test("retains the published panel ID per guild and sends it on retry", async ({ page }) => {
    const configs = new Map([
      [guilds[0].id, verificationBotControlConfig(false, "")],
      [guilds[1].id, verificationBotControlConfig(true, "panel-south", false)],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "panel-north" },
      message: "Persistarea configurației a eșuat.",
    }));

    await page.goto("/moderare/verificare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await page.getByRole("button", { name: guilds[0].name }).click();
    const enabled = page.getByRole("checkbox", { name: "Activ" });
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await page.getByRole("button", { name: "Salvează verificarea" }).click();

    await expect(page.getByRole("alert")).toContainText("Panoul a fost publicat, dar salvarea configurației a fost parțială.");
    await expect(page.getByRole("alert")).toContainText("panel-north");
    await expect(page.getByText("Panou publicat; salvare parțială")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("alert")).toContainText("panel-north");

    const guildSelector = page.getByRole("combobox").first();
    await guildSelector.click();
    await page.getByRole("option", { name: guilds[1].name }).click();
    await expect(page.getByRole("checkbox", { name: "Activ" })).toBeChecked();
    await expect(page.getByText("Activată în configurație; botul Discord este offline")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Activ" }).uncheck();
    await page.getByRole("button", { name: "Salvează verificarea" }).click();
    expect(putBodies.get(guilds[1].id)?.[0].verification.panelMessageId).toBe("panel-south");

    await guildSelector.click();
    await page.getByRole("option", { name: guilds[0].name }).click();
    await expect(page.getByRole("alert")).toContainText("panel-north");
    await expect(page.getByRole("checkbox", { name: "Activ" })).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Activ" }).check();
    const retry = page.waitForRequest((request) =>
      request.url().includes(`/guilds/${guilds[0].id}/bot-control`) && request.method() === "PUT");
    await page.getByRole("button", { name: "Salvează verificarea" }).click();
    const retryBody = JSON.parse((await retry).postData() || "{}");
    expect(retryBody.verification.panelMessageId).toBe("panel-north");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(putBodies.get(guilds[0].id)?.[1].verification.panelMessageId).toBe("panel-north");
  });

  test("blocks retry when a published panel ID is missing until manual reconciliation", async ({ page }) => {
    const configs = new Map([
      [guilds[0].id, verificationBotControlConfig(false, "")],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "" },
      message: "Discord a publicat panoul, dar nu a returnat ID-ul.",
    }));

    await page.goto("/moderare/verificare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await page.getByRole("button", { name: guilds[0].name }).click();
    await page.getByRole("checkbox", { name: "Activ" }).check();
    await page.getByRole("button", { name: "Salvează verificarea" }).click();
    await expect(page.getByRole("alert")).toContainText("Elimină sau reconciliază manual panoul");
    const saveButton = page.getByRole("button", { name: "Salvează verificarea" });
    await expect(saveButton).toBeDisabled();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Confirmă reconcilierea manuală" }).click();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(2);
  });

  test("blocks retry when session storage cannot preserve a published panel ID", async ({ page }) => {
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "moderation.botControlPanelRecovery.v1") {
          throw new DOMException("Session storage unavailable", "QuotaExceededError");
        }
        setItem.call(this, key, value);
      };
    });
    const configs = new Map([
      [guilds[0].id, verificationBotControlConfig(false, "")],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "panel-north" },
      message: "Partial response from Discord.",
    }));

    await page.goto("/moderare/verificare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await page.getByRole("button", { name: guilds[0].name }).click();
    await page.getByRole("checkbox", { name: "Activ" }).check();
    await page.getByRole("button", { name: "Salvează verificarea" }).click();

    const recoveryAlert = page.getByRole("alert");
    await expect(recoveryAlert).toContainText("panel-north");
    await expect(recoveryAlert).toContainText("Stocarea sesiunii nu este disponibilă.");
    await expect(page.getByRole("button", { name: "Salvează verificarea" })).toBeDisabled();
  });

  test("does not claim a panel was published for a generic partial apply", async ({ page }) => {
    const configs = new Map([
      [guilds[0].id, verificationBotControlConfig(false, "")],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: false,
      verification: body.verification,
      message: "Salvarea configurației nu a fost efectuată.",
    }));

    await page.goto("/moderare/verificare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await page.getByRole("button", { name: guilds[0].name }).click();
    await page.getByRole("checkbox", { name: "Activ" }).check();
    await page.getByRole("button", { name: "Salvează verificarea" }).click();
    const partialAlert = page.getByRole("alert");
    await expect(partialAlert).toContainText("Serverul a raportat un rezultat parțial; efectele Discord nu sunt confirmate.");
    await expect(partialAlert).not.toContainText("Panoul a fost publicat");
    await expect(partialAlert).not.toContainText("Salvarea configurației nu a fost efectuată.");
    await expect(page.getByText("Aplicare parțială; efecte neconfirmate")).toBeVisible();
  });
});

test.describe("moderation guild chooser", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
  });

  test("requires an explicit eligible guild choice instead of selecting the first guild", async ({ page }) => {
    await page.route("**/api/moderation/session", async (route) => {
      await route.fulfill({
        json: {
          authenticated: true,
          userId: "999999999",
          guilds,
          csrfToken: "test-csrf",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      });
    });
    await page.goto("/moderare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cenușa Nordului" })).toHaveCount(0);
    await page.getByRole("button", { name: "Turnul Gol" }).click();
    await expect(page.getByRole("combobox").first()).toContainText("Turnul Gol");
  });

  test("shows a clear empty state when no eligible guilds are returned", async ({ page }) => {
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: {
        discordOAuthConfigured: true,
        authorizationUrl: "/api/moderation/oauth/discord",
        botInviteUrl: "https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot+applications.commands&permissions=268504064",
      } });
    });
    await page.route("**/api/moderation/session", async (route) => {
      await route.fulfill({
        json: {
          authenticated: true,
          userId: "999999999",
          guilds: [],
          csrfToken: "test-csrf",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      });
    });
    await page.goto("/moderare");
    await expect(page.getByRole("heading", { name: "Nu ai servere de gestionat" })).toBeVisible();
    await expect(page.getByText("botul trebuie să fie prezent")).toBeVisible();
    await expect(page.getByRole("button", { name: "Schimbă contul" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Invită botul pe server" })).toBeVisible();
    await expect(page.getByText("conectează-te din nou pentru a vedea noul server")).toBeVisible();
  });
});