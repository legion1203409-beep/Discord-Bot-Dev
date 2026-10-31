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
    memberJoinTitleTemplate: "",
    memberJoinDescriptionTemplate: "",
    memberLeaveTitleTemplate: "",
    memberLeaveDescriptionTemplate: "",
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
        roles: [
          { id: "444444444", name: "Verified", position: 2, managed: false, assignable: true, elevated: false, color: "#2fcb8c" },
          { id: "555555555", name: "━━ MEMBRI ━━", position: 5, managed: false, assignable: true, elevated: false, color: null },
          { id: "666666666", name: "Moderator", position: 8, managed: false, assignable: true, elevated: true, color: "#e2b467" },
          { id: "888888888", name: "Fondator", position: 30, managed: false, assignable: false, elevated: false, color: null },
        ],
        channels: [{ id: "777777777", name: "verificare", type: 0 }, { id: "333333333", name: "Tichete staff", type: 4 }],
        emojis: [],
        botCapabilities: { online: true, messageContent: true, guildMembers: true, canManageRoles: true },
      },
    });
  });
  await page.route("**/api/moderation/guilds/*/verification/members", async (route) => {
    const guildId = route.request().url().match(/guilds\/(\d+)\/verification\/members/)?.[1] ?? guilds[0].id;
    await route.fulfill({ json: { guildId, roleId: "", roleName: null, total: 0, verifiedTotal: 0, unverifiedTotal: 0, members: [] } });
  });
  return putBodies;
}

test.describe("authenticated moderation console", () => {
  const savedConfigs = new Map(guilds.map(({ id }) => [id, fullConfig()]));
  const configRequests: Array<{ guildId: string; method: string; body?: Record<string, unknown> }> = [];
  const caseHistory = new Map<string, Array<{ id: string }>>();
  const auditHistory = new Map<string, Array<{ id: string }>>();
  const historyRequests: Array<{ guildId: string; resource: "cases" | "audit"; method: string }> = [];
  let actionBodies: unknown[] = [];
  let rolePreviewBodies: unknown[] = [];

  test.beforeEach(async ({ page }) => {
    actionBodies = [];
    rolePreviewBodies = [];
    configRequests.length = 0;
    historyRequests.length = 0;
    for (const guild of guilds) {
      savedConfigs.set(guild.id, fullConfig());
      caseHistory.set(guild.id, []);
      auditHistory.set(guild.id, []);
    }
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
    await page.route("**/api/moderation/session", async (route) => {
      await route.fulfill({ json: { authenticated: true, userId: "999999999", guilds, csrfToken: "test-csrf", expiresAt: "2099-01-01T00:00:00.000Z" } });
    });
    await page.route("**/api/moderation/guilds/*/config", async (route) => {
      const id = route.request().url().match(/guilds\/(\d+)\/config/)?.[1] || guilds[0].id;
      const method = route.request().method();
      if (route.request().method() === "PUT") {
        expect(route.request().headers()["if-match"]).toBeTruthy();
        const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
        configRequests.push({ guildId: id, method, body });
        // The API parses an empty object into the schema's per-server defaults.
        savedConfigs.set(id, Object.keys(body).length ? body as ReturnType<typeof fullConfig> : fullConfig());
        await route.fulfill({ json: { config: savedConfigs.get(id), version: 2 }, headers: { ETag: '"2"' } });
        return;
      }
      configRequests.push({ guildId: id, method });
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
    await page.route("**/api/moderation/guilds/*/cases**", async (route) => {
      const id = route.request().url().match(/guilds\/(\d+)\/cases/)?.[1] ?? guilds[0].id;
      historyRequests.push({ guildId: id, resource: "cases", method: route.request().method() });
      await route.fulfill({ json: { items: caseHistory.get(id) ?? [] } });
    });
    await page.route("**/api/moderation/guilds/*/logs/audit**", async (route) => {
      const id = route.request().url().match(/guilds\/(\d+)\/logs\/audit/)?.[1] ?? guilds[0].id;
      historyRequests.push({ guildId: id, resource: "audit", method: route.request().method() });
      await route.fulfill({ json: { items: auditHistory.get(id) ?? [] } });
    });
    await page.route("**/api/moderation/guilds/*/actions/role-preview", async (route) => {
      rolePreviewBodies.push(JSON.parse(route.request().postData() || "{}"));
      const guildId = route.request().url().match(/guilds\/(\d+)\/actions\/role-preview/)?.[1] ?? guilds[0].id;
      await route.fulfill({ json: {
        previewToken: "bulk-role-preview-token-123",
        guildId,
        guildName: guilds.find((guild) => guild.id === guildId)?.name ?? guilds[0].name,
        roleId: "333333333",
        roleName: "Moderatori",
        totalMembers: 10,
        humanMemberCount: 8,
        eligibleCount: 5,
        alreadyAssignedCount: 2,
        skippedCount: 3,
        botCount: 2,
      } });
    });
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
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
  }

  async function openConfigTools(page: import("@playwright/test").Page) {
    await page.goto("/moderare/config");
    await chooseFirstGuild(page);
    await page.getByTestId("button-open-customization").click();
  }

  async function expectNavGroupExpanded(page: import("@playwright/test").Page, groupId: string) {
    const group = page.getByTestId(`nav-group-${groupId}`);
    await expect(group).toBeVisible();
    await expect(group).not.toHaveAttribute("aria-expanded");
    await expect(page.locator(`#nav-group-${groupId}`)).toBeVisible();
  }

  test("keeps all eleven dock destinations reachable on mobile and desktop", async ({ page }) => {
    test.setTimeout(45_000);
    const dockIds = [
      "overview", "protection", "judge", "sanctions", "cases",
      "verification", "tickets", "rpg", "oracle", "settings", "assistant",
    ] as const;

    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/moderare");
    await chooseFirstGuild(page);

    const dock = page.getByRole("navigation", { name: "Navigare rapidă" });
    const dockItems = dock.locator(".oracle-dock-items");
    await expect(dock.locator("a.oracle-dock-item")).toHaveCount(10);
    await expect(dock).toBeVisible();
    const mobileMetrics = await dockItems.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(mobileMetrics.scrollWidth).toBeGreaterThan(mobileMetrics.clientWidth);
    expect(mobileMetrics.documentWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth);
    await page.screenshot({ path: "/tmp/moderation-panel-mobile-320.png" });

    for (const id of dockIds) {
      const item = page.getByTestId(`dock-${id}`);
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeVisible();
      await item.click();
      await expect(item).toHaveAttribute("aria-current", "page");
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/moderare");
    await expect(page.getByRole("navigation", { name: "Navigare rapidă" })).toBeVisible();
    for (const id of dockIds) {
      await expect(page.getByTestId(`dock-${id}`)).toBeVisible();
    }
    const desktopMetrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(desktopMetrics.documentWidth).toBeLessThanOrEqual(desktopMetrics.viewportWidth);
    await page.screenshot({ path: "/tmp/moderation-panel-desktop-1440.png" });

    await page.getByTestId("button-open-customization").click();
    await page.getByTestId("switch-dock-position").click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".oracle-dock-items")).toHaveCSS("flex-direction", "column");
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect(page.locator(".oracle-dock-items")).toHaveCSS("flex-direction", "row");
    for (const id of dockIds) {
      await expect(page.getByTestId(`dock-${id}`)).toBeInViewport();
    }
    await expect(page.getByTestId("button-open-customization")).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".oracle-dock-items")).toHaveCSS("flex-direction", "row");
    await page.getByTestId("dock-assistant").scrollIntoViewIfNeeded();
    await page.getByTestId("dock-assistant").click();
    await expect(page.getByTestId("dock-assistant")).toHaveAttribute("aria-current", "page");
  });

  test("keeps search results and bot tabs synchronized with query-only navigation", async ({ page }) => {
    // The old roles tab now opens the channels and access of the bot control.
    await page.goto("/moderare/bot?tab=roles");
    await chooseFirstGuild(page);
    await expect(page).toHaveURL("/moderare/control/canale");

    await page.keyboard.press("Control+k");
    const searchInput = page.getByTestId("input-settings-search");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("canale si acces");
    await expect(page.getByTestId("search-result-provisioning")).toHaveAttribute("aria-selected", "true");

    await searchInput.fill("tichete");
    const ticketsResult = page.getByTestId("search-result-tickets");
    await expect(ticketsResult).toHaveAttribute("aria-selected", "false");
    await ticketsResult.click();
    await expect(page).toHaveURL(/\/moderare\/tichete$/);

    await page.keyboard.press("Meta+k");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("statistici bot");
    const statisticsResult = page.getByTestId("search-result-bot-statistics");
    await expect(statisticsResult).toHaveAttribute("aria-selected", "false");
    await statisticsResult.click();
    await expect(page).toHaveURL("/moderare/control/invitatii");

    await page.keyboard.press("Control+k");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("statistici bot");
    await expect(page.getByTestId("search-result-bot-statistics")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("dock-overview")).not.toHaveAttribute("aria-current", "page");
  });

  test("reduces motion without hiding controls and honors the system preference", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/moderare");
    await chooseFirstGuild(page);

    const dock = page.locator(".oracle-dock");
    const animationMilliseconds = async () => dock.evaluate((element) => {
      const duration = getComputedStyle(element).animationDuration.split(",")[0]!.trim();
      return duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    });
    expect(await animationMilliseconds()).toBeGreaterThan(100);

    await page.getByTestId("button-open-customization").click();
    const motionSwitch = page.getByRole("switch", { name: "Mișcare și animații" });
    await expect(motionSwitch).toBeChecked();
    await motionSwitch.click();
    await expect(motionSwitch).not.toBeChecked();
    await expect.poll(() => page.locator("html").getAttribute("data-motion")).toBe("reduced");
    expect(await animationMilliseconds()).toBeLessThanOrEqual(0.02);
    await page.keyboard.press("Escape");
    await expect(dock).toBeVisible();
    await expect(dock.locator("a.oracle-dock-item")).toHaveCount(10);
    await expect(page.locator(".oracle-page-view")).toBeVisible();
    await page.screenshot({ path: "/tmp/moderation-panel-mobile-reduced-motion.png" });

    const savedMotion = await page.evaluate(() => localStorage.getItem("oracol.panel.preferences.v1"));
    expect(savedMotion).toContain('"motion":false');
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await expect(dock).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("button-open-customization").click();
    const restoredMotionSwitch = page.getByRole("switch", { name: "Mișcare și animații" });
    await expect(restoredMotionSwitch).not.toBeChecked();
    await restoredMotionSwitch.click();
    await expect(restoredMotionSwitch).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
    expect(await animationMilliseconds()).toBeLessThanOrEqual(0.02);
    await expect(dock).toBeVisible();
    await expect(dock.locator("a.oracle-dock-item")).toHaveCount(10);
  });

  test("keeps staff questions and member answers visible after switching cases and reloading", async ({ page }) => {
    const firstCaseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secondCaseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const question = "Te rugăm să clarifici ora incidentului.";
    const answer = "Incidentul s-a petrecut în jurul orei 18:30.";
    const firstCase = {
      id: firstCaseId,
      guildId: guilds[0].id,
      subjectId: "member-fixture",
      actorId: "staff-fixture",
      actionType: "warn",
      reason: "Fixture de test; nicio sancțiune live.",
      status: "open",
      createdAt: "2026-10-01T12:00:00.000Z",
      evidence: [],
      notes: [
        { authorId: "staff-fixture", body: question, createdAt: "2026-10-01T12:01:00.000Z" },
        { authorId: "member-fixture", body: answer, createdAt: "2026-10-01T12:02:00.000Z" },
      ],
    };
    const secondCase = {
      ...firstCase,
      id: secondCaseId,
      subjectId: "another-member-fixture",
      notes: [
        { authorId: "another-staff-fixture", body: "Notiță izolată pentru al doilea dosar.", createdAt: "2026-10-02T12:00:00.000Z" },
      ],
    };
    const caseFixtures = new Map([
      [firstCaseId, firstCase],
      [secondCaseId, secondCase],
    ]);
    const listFixtures = [secondCase, firstCase];

    // The mocked authenticated session and API remain test-only; case data is
    // served from this fixture after every detail request and page reload.
    await page.unroute("**/api/moderation/guilds/*/cases**");
    await page.route("**/api/moderation/guilds/*/cases**", async (route) => {
      const url = new URL(route.request().url());
      const detailCaseId = url.pathname.match(/\/cases\/([^/]+)$/)?.[1];
      if (detailCaseId) {
        const fixture = caseFixtures.get(detailCaseId);
        await route.fulfill(fixture ? { json: fixture } : { status: 404, json: { error: "Case not found" } });
        return;
      }
      await route.fulfill({ json: { items: listFixtures } });
    });

    const openCase = async (caseId: string) => {
      const row = page.getByTestId(`case-row-${caseId}`);
      await expect(row).toBeVisible();
      await row.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`caz=${caseId}`));
      return dialog;
    };
    const expectFirstCaseHistory = async (dialog: import("@playwright/test").Locator) => {
      await expect(dialog.getByTestId("case-notes").locator(".pn-rec-note-b")).toHaveText([question, answer]);
      await expect(dialog.getByTestId("case-notes").locator(".pn-rec-who b")).toHaveText(["staff-fixture", "member-fixture"]);
    };

    await page.goto("/moderare/cazuri");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cazuri", exact: true })).toBeVisible();

    let dialog = await openCase(firstCaseId);
    await expectFirstCaseHistory(dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openCase(secondCaseId);
    await expect(dialog.getByTestId("case-notes").locator(".pn-rec-note-b")).toHaveText(["Notiță izolată pentru al doilea dosar."]);
    await expect(dialog.getByText(question, { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openCase(firstCaseId);
    await expectFirstCaseHistory(dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Cazuri", exact: true })).toBeVisible();
    dialog = await openCase(firstCaseId);
    await expectFirstCaseHistory(dialog);
    // A case's address opens it straight away.
    await page.reload();
    await expectFirstCaseHistory(page.getByRole("dialog"));
  });

  test("filters cases, closes one and answers an action Discord did not confirm", async ({ page }) => {
    const openCase = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", guildId: guilds[0].id, subjectId: "555555555", actorId: "999999999", actionType: "warn",
      reason: "Limbaj nepotrivit", status: "open", createdAt: "2026-10-01T12:00:00.000Z", evidence: [], metadata: {},
    };
    const closedCase = { ...openCase, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", actionType: "ban", status: "closed", closedAt: "2026-10-02T12:00:00.000Z" };
    const cases = [openCase, closedCase];
    const listQueries: string[] = [];
    const patches: any[] = [];
    const reconciles: any[] = [];
    let ledger = [{ id: "ledger-1", status: "uncertain", actionType: "mute", actorId: "999999999", input: { type: "mute", targetId: "555555555", durationMinutes: 10 }, createdAt: "2026-10-03T12:00:00.000Z" }];
    await page.unroute("**/api/moderation/guilds/*/cases**");
    await page.route("**/api/moderation/guilds/*/cases**", async (route) => {
      const url = new URL(route.request().url());
      const caseId = url.pathname.match(/\/cases\/([^/]+)$/)?.[1];
      if (caseId) {
        const item = cases.find((entry) => entry.id === caseId)!;
        if (route.request().method() === "PATCH") {
          const body = JSON.parse(route.request().postData() || "{}");
          patches.push(body);
          Object.assign(item, body);
        }
        await route.fulfill({ json: { ...item, notes: [], appeal: null } });
        return;
      }
      listQueries.push(url.search);
      const status = url.searchParams.get("status");
      const actionType = url.searchParams.get("actionType");
      const matching = cases.filter((item) => !actionType || item.actionType === actionType);
      await route.fulfill({ json: {
        items: matching.filter((item) => !status || item.status === status),
        counts: { open: matching.filter((item) => item.status === "open").length, closed: matching.filter((item) => item.status === "closed").length },
      } });
    });
    await page.route("**/api/moderation/guilds/*/actions?**", async (route) => {
      const status = new URL(route.request().url()).searchParams.get("status");
      await route.fulfill({ json: { items: ledger.filter((item) => item.status === status) } });
    });
    await page.route("**/api/moderation/guilds/*/actions/*/reconcile", async (route) => {
      reconciles.push(JSON.parse(route.request().postData() || "{}"));
      ledger = [];
      await route.fulfill({ json: { ok: true } });
    });
    await page.unroute("**/api/moderation/guilds/*/logs/audit**");
    await page.route("**/api/moderation/guilds/*/logs/audit**", async (route) => {
      await route.fulfill({ json: { items: [], total: 0 } });
    });

    await page.goto("/moderare/cazuri");
    await chooseFirstGuild(page);
    await expect(page.getByTestId("cases-status")).toContainText("Deschise · 1");
    await page.getByTestId("cases-status").getByRole("radio", { name: /Închise/ }).click();
    await expect(page.getByTestId("cases-list").getByRole("button")).toHaveCount(1);
    await expect(page.getByTestId(`case-row-${closedCase.id}`)).toContainText("Interdicție");
    await page.getByTestId("cases-action").selectOption("warn");
    await expect(page.getByTestId("cases-empty")).toContainText("Niciun caz nu se potrivește filtrelor.");
    expect(listQueries.at(-1)).toContain("actionType=warn");
    await page.getByTestId("cases-clear").click();
    await page.getByTestId(`case-row-${openCase.id}`).click();
    await page.getByTestId("case-toggle").click();
    await expect(page.getByTestId("case-done")).toContainText("Cazul e închis.");
    expect(patches).toEqual([{ status: "closed" }]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(`case-row-${openCase.id}`)).toContainText("Închis");

    await page.getByTestId("nav-records-audit").click();
    await expect(page).toHaveURL("/moderare/audit");
    await expect(page.getByTestId("audit-ledger")).toContainText("Timeout de 10 minute");
    await page.getByTestId("ledger-check-ledger-1").click();
    await page.getByRole("textbox", { name: "Ce ai găsit în Discord" }).fill("Membrul are timeout.");
    await page.getByRole("button", { name: "S-a aplicat", exact: true }).click();
    await expect(page.getByTestId("audit-ledger")).toHaveCount(0);
    expect(reconciles).toEqual([{ status: "applied", note: "Membrul are timeout." }]);
    await expect(page.getByTestId("audit-empty")).toContainText("Niciun eveniment încă.");
  });

  test("saves setup drafts per guild, resumes only on request, and blocks silent session conflicts", async ({ page }) => {
    const userId = "999999999";
    const drafts = new Map<string, { draft: any; revision: number; updatedAt: string }>();
    const keyFor = (guildId: string) => `${guildId}:${userId}`;
    const template = {
      roles: [{ key: "member", name: "Membru" }],
      categories: [{
        key: "community", name: "Comunitate", channels: [{
          key: "general", name: "general", readers: ["everyone"], writers: ["everyone"], explanation: "",
        }],
      }],
    };

    await page.route("**/api/moderation/guilds/*/server-setup", async (route) => {
      const guildId = route.request().url().match(/guilds\/(\d+)\/server-setup/)?.[1] ?? guilds[0].id;
      await route.fulfill({ json: { draft: structuredClone(template), aiAvailable: false, uncertain: [] } });
    });
    await page.route("**/api/moderation/guilds/*/server-setup/draft", async (route) => {
      const guildId = route.request().url().match(/guilds\/(\d+)\/server-setup\/draft/)?.[1] ?? guilds[0].id;
      const key = keyFor(guildId);
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { savedDraft: drafts.get(key) ?? null } });
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}") as { draft: any; expectedRevision: number };
      const current = drafts.get(key);
      if ((current?.revision ?? 0) !== body.expectedRevision) {
        await route.fulfill({ status: 409, json: { error: "Draftul salvat a fost modificat în altă sesiune." } });
        return;
      }
      const savedDraft = {
        draft: structuredClone(body.draft),
        revision: (current?.revision ?? 0) + 1,
        updatedAt: "2026-10-09T12:00:00.000Z",
      };
      drafts.set(key, savedDraft);
      await route.fulfill({ json: { savedDraft } });
    });

    await page.goto("/moderare/pornire-server");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Arhitectura serverului" })).toBeVisible();
    await page.getByTestId("input-role-member").fill("Draft Nord");
    const northSave = page.waitForResponse((response) =>
      response.url().includes(`/guilds/${guilds[0].id}/server-setup/draft`) && response.request().method() === "PUT");
    await page.getByTestId("button-save-setup-draft").click();
    expect((await northSave).status()).toBe(200);
    expect(drafts.get(keyFor(guilds[0].id))?.draft.roles[0].name).toBe("Draft Nord");

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[1].name }).click();
    await expect(page.getByTestId("input-role-member")).toHaveValue("Membru");
    await page.getByTestId("input-role-member").fill("Draft Sud");
    const southSave = page.waitForResponse((response) =>
      response.url().includes(`/guilds/${guilds[1].id}/server-setup/draft`) && response.request().method() === "PUT");
    await page.getByTestId("button-save-setup-draft").click();
    expect((await southSave).status()).toBe(200);
    expect(drafts.get(keyFor(guilds[1].id))?.draft.roles[0].name).toBe("Draft Sud");
    expect(drafts.get(keyFor(guilds[0].id))?.draft.roles[0].name).toBe("Draft Nord");

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[0].name }).click();
    await page.getByTestId("button-resume-setup-draft").click();
    await page.getByTestId("button-confirm-resume-setup-draft").click();
    await expect(page.getByTestId("input-role-member")).toHaveValue("Draft Nord");
    await expect(page.getByTestId("text-restored-draft-review")).toBeVisible();
    await expect(page.getByTestId("button-open-apply")).toBeDisabled();

    const localDraft = drafts.get(keyFor(guilds[0].id))!;
    drafts.set(keyFor(guilds[0].id), {
      ...localDraft,
      draft: { ...localDraft.draft, roles: [{ key: "member", name: "Salvat din altă sesiune" }] },
      revision: localDraft.revision + 1,
    });
    await page.getByTestId("input-role-member").fill("Modificare locală");
    const conflictResponse = page.waitForResponse((response) =>
      response.url().includes(`/guilds/${guilds[0].id}/server-setup/draft`) && response.request().method() === "PUT");
    await page.getByTestId("button-save-setup-draft").click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(page.getByTestId("text-setup-draft-save-error")).toContainText("O altă sesiune");
    await expect(page.getByTestId("input-role-member")).toHaveValue("Modificare locală");
    await expect(page.getByTestId("button-save-setup-draft")).toBeDisabled();

    await page.getByTestId("button-overwrite-saved-setup-draft").click();
    await expect(page.getByRole("alertdialog", { name: "Înlocuiești versiunea salvată?" })).toBeVisible();
    await page.getByTestId("button-cancel-overwrite-saved-draft").click();
    expect(drafts.get(keyFor(guilds[0].id))?.draft.roles[0].name).toBe("Salvat din altă sesiune");
    await expect(page.getByTestId("input-role-member")).toHaveValue("Modificare locală");
    await page.getByTestId("button-overwrite-saved-setup-draft").click();
    await page.getByTestId("button-confirm-overwrite-saved-draft").click();
    await expect(page.getByTestId("text-setup-draft-save-notice")).toContainText("Draftul a fost salvat");
    expect(drafts.get(keyFor(guilds[0].id))?.draft.roles[0].name).toBe("Modificare locală");
  });

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

    // Pausing asks first, in the page; resuming does not.
    await gameToggle.click();
    expect(gameplayPuts).toEqual([]);
    await page.getByTestId("button-gameplay-state-confirm").click();
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

  test("the overview lists what needs a look and links to where it is fixed", async ({ page }) => {
    await page.goto("/moderare");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cenușa Nordului", level: 1 })).toBeVisible();
    const attention = page.getByTestId("overview-attention");
    await expect(attention.getByTestId("attention-audit")).toContainText("Auditul e oprit");
    await expect(attention.getByTestId("attention-commands")).toContainText("Comenzile staff-ului sunt oprite");
    await expect(page.getByTestId("overview-summary")).toContainText("/8");
    await attention.getByTestId("attention-audit").getByRole("link").click();
    await expect(page).toHaveURL("/moderare/jurnale/audit");
  });

  test("dashboard sections stack cleanly at a 1024px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/moderare");
    await expect(page).toHaveURL("/moderare");
    await chooseFirstGuild(page);
    await expect(page.getByTestId("card-haunted-house")).toHaveCount(0);

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
    expect(firstModuleCard?.width).toBeGreaterThan(260);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

  test("AI categories follow the general ticks until they get their own, and the choice persists", async ({ page }) => {
    await page.goto("/moderare/ai");
    await chooseFirstGuild(page);
    await page.getByTestId("actions-ai-general").getByRole("checkbox", { name: "Avertisment" }).click();

    await page.getByRole("switch", { name: "Amenințări", exact: true }).click();
    await page.getByTestId("ai-category-threats-open").click();
    await expect(page.getByTestId("actions-ai-threats-inherited")).toContainText("Ca setările generale: Avertisment");
    await page.getByRole("switch", { name: "Folosește acțiunile generale — Amenințări" }).click();
    const threats = page.getByTestId("actions-ai-threats");
    await expect(threats.getByRole("checkbox", { name: "Avertisment" })).toBeChecked();
    await threats.getByRole("checkbox", { name: "Ban" }).click();
    await threats.getByRole("checkbox", { name: "Anunță staff-ul" }).click();
    await expect(page.getByTestId("actions-ai-threats-summary")).toContainText("Avertisment + Ban + Anunță staff-ul");

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    const ai = savedConfigs.get(guilds[0].id)?.ai as any;
    expect(ai).toMatchObject({ action: "warn", categories: { threats: true } });
    expect(ai.categorySettings.threats).toEqual({ action: "ban", deleteMessage: false, warnMember: true, alertStaff: true });

    await page.reload();
    await page.getByTestId("ai-category-threats-open").click();
    await expect(page.getByRole("switch", { name: "Folosește acțiunile generale — Amenințări" })).not.toBeChecked();
    await expect(page.getByTestId("actions-ai-threats").getByRole("checkbox", { name: "Ban" })).toBeChecked();
  });

  test("AI exceptions are chosen from the server's channels and roles and persist", async ({ page }) => {
    await page.goto("/moderare/ai");
    await chooseFirstGuild(page);
    await page.getByTestId("ai-excluded-channels").getByRole("checkbox", { name: "#audit" }).click();
    await page.getByTestId("ai-excluded-roles").getByRole("checkbox", { name: "@Moderatori" }).click();
    const manual = page.getByLabel("Adaugă după ID: Roluri exceptate de la AI");
    await manual.fill("12ab");
    await manual.press("Enter");
    await expect(page.getByTestId("ai-excluded-roles").getByRole("alert")).toContainText("între 5 și 25 de cifre");
    await manual.fill("987654321098765432");
    await manual.press("Enter");

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    const ai = savedConfigs.get(guilds[0].id)?.ai as any;
    expect(ai.excludedChannelIds).toEqual(["444444444"]);
    expect(ai.excludedRoleIds).toEqual(["333333333", "987654321098765432"]);

    await page.reload();
    await expect(page.getByTestId("ai-excluded-channels").getByRole("checkbox", { name: "#audit" })).toBeChecked();
    await expect(page.getByTestId("ai-excluded-roles").getByRole("checkbox", { name: "ID 987654321098765432, nu apare în listă" })).toBeChecked();
  });

  test("escalation steps, the mute length of a step and the reset are saved", async ({ page }) => {
    await page.goto("/moderare/sanctiuni");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Escaladarea sancțiunilor" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Modulele sancțiunilor" }).getByRole("link")).toHaveCount(6);
    await expect(page.getByTestId("nav-sanctions-escalation")).toHaveAttribute("aria-current", "page");

    await page.getByRole("switch", { name: "Activează escaladarea" }).click();
    // One saved step; each new one starts one offense later with a stronger sanction.
    await page.getByTestId("escalation-add-level").click();
    await expect(page.getByTestId("escalation-level-2-violations")).toHaveValue("2");
    await expect(page.getByTestId("escalation-level-2-action")).toHaveValue("mute");
    await page.getByTestId("escalation-level-2-minutes").fill("1440");
    await page.getByTestId("escalation-add-level").click();
    await expect(page.getByTestId("escalation-level-3-action")).toHaveValue("kick");
    await page.getByTestId("escalation-reset-days").fill("14");
    await expect(page.getByTestId("escalation-ladder")).toContainText("Mute 1 zi");

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    const escalation = savedConfigs.get(guilds[0].id)?.escalation as any;
    expect(escalation).toEqual({
      enabled: true, resetAfterDays: 14,
      levels: [
        { level: 1, violations: 1, action: "warn" },
        { level: 2, violations: 2, action: "mute", muteMinutes: 1440 },
        { level: 3, violations: 3, action: "kick" },
      ],
    });

    await page.reload();
    await expect(page.getByTestId("escalation-level-2-minutes")).toHaveValue("1440");
    await expect(page.getByTestId("escalation-reset-days")).toHaveValue("14");
  });

  test("staff commands, roles and channels, and the schedule are saved together from one draft", async ({ page }) => {
    await page.unroute("**/api/moderation/guilds/*/metadata");
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      await route.fulfill({
        json: {
          guild: { id: guilds[0].id, name: guilds[0].name, ownerId: "999999999" },
          roles: [
            { id: guilds[0].id, name: "@everyone", position: 0, managed: false },
            { id: "333333333", name: "Moderatori", position: 2, managed: false },
          ],
          channels: [
            { id: "444444444", name: "audit", type: 0, parentId: null },
            { id: "555555555", name: "ajutor", type: 15, parentId: null },
            { id: "666666666", name: "voice", type: 2, parentId: null },
          ],
          botCapabilities: { online: true, messageContent: true, guildMembers: true },
        },
      });
    });
    await page.goto("/moderare/sanctiuni/comenzi");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Comenzi de moderare" })).toBeVisible();
    await page.getByRole("switch", { name: "Activează comenzile de moderare" }).click();
    await page.getByRole("switch", { name: "/purge", exact: true }).click();
    await expect(page.getByTestId("command-purge")).toContainText("Oprită pentru toți");
    await page.getByTestId("command-ban-open").click();
    const banRoles = page.getByTestId("command-ban-roles");
    // @everyone is every member: it is never offered.
    await expect(banRoles.getByRole("checkbox", { name: "@@everyone" })).toHaveCount(0);
    await banRoles.getByRole("checkbox", { name: "@Moderatori" }).click();
    await expect(page.getByTestId("command-ban")).toContainText("Ban Members sau 1 rol ales");

    await page.getByTestId("nav-sanctions-policies").click();
    await expect(page).toHaveURL("/moderare/sanctiuni/roluri-canale");
    const strict = page.getByTestId("policy-strict-channels");
    // Forum and voice channels hold no messages the bot can moderate here.
    await expect(strict.getByRole("checkbox", { name: "#ajutor" })).toHaveCount(0);
    await expect(strict.getByRole("checkbox", { name: "#voice" })).toHaveCount(0);
    await strict.getByRole("checkbox", { name: "#audit" }).click();

    await page.getByTestId("nav-sanctions-schedule").click();
    await page.getByRole("switch", { name: "Noapte strictă", exact: true }).click();
    await page.getByTestId("schedule-timezone").selectOption("Europe/Bucharest");
    await page.getByTestId("schedule-strictNight-end").selectOption("6");
    await expect(page.getByTestId("profile-strictNight")).toContainText("22:00 – 06:59");
    // The unsaved commands are still there after visiting two other modules.
    await expect(page.getByTestId("nav-sanctions-commands").getByRole("img", { name: "are modificări nesalvate" })).toBeVisible();

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    const saved = savedConfigs.get(guilds[0].id) as any;
    expect(saved.manualTools).toEqual({ enabled: true, commandGrants: { ban: ["333333333"] }, logActions: false, disabledCommands: ["purge"] });
    expect(saved.channels.strictChannelIds).toEqual(["444444444"]);
    expect(saved.timeProfiles).toMatchObject({ timezone: "Europe/Bucharest", strictNight: { enabled: true, startHour: 22, endHour: 6 } });
    expect(saved.escalation).toEqual(fullConfig().escalation);

    await page.goto("/moderare/sanctiuni/comenzi");
    await expect(page.getByRole("switch", { name: "/purge", exact: true })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "/ban", exact: true })).toBeChecked();
  });

  test("ban appeals are turned on with a staff channel, the unban switch and the wait, and saved", async ({ page }) => {
    await page.unroute("**/api/moderation/guilds/*/metadata");
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      await route.fulfill({
        json: {
          guild: { id: guilds[0].id, name: guilds[0].name, ownerId: "999999999" },
          roles: [],
          channels: [{ id: "444444444", name: "contestatii-staff", type: 0, parentId: null }],
          botCapabilities: { online: true, messageContent: true, guildMembers: true },
        },
      });
    });
    await page.goto("/moderare/sanctiuni/contestatii");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Contestații de ban" })).toBeVisible();
    await expect(page.getByTestId("nav-sanctions-appeals")).toHaveAttribute("aria-current", "page");
    await page.getByRole("switch", { name: "Activează contestațiile de pe site" }).click();
    // On without a staff channel: the page says so and refuses to save.
    await expect(page.getByText("Alege canalul, altfel contestațiile nu ajung la nimeni.")).toBeVisible();
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    // Nothing was sent: the draft is refused before it leaves the page.
    expect((savedConfigs.get(guilds[0].id) as any).appeals?.enabled).not.toBe(true);
    await page.getByRole("combobox", { name: "Canalul contestațiilor" }).selectOption("444444444");
    await page.getByRole("switch", { name: "Scoate banul când e acceptată" }).click();
    await page.getByTestId("appeals-cooldown").fill("14");
    await page.getByTestId("appeals-accepted-title").fill("Bine ai revenit pe {guild}");
    await page.getByTestId("appeals-accepted-button").fill("Hai înapoi");
    await page.getByTestId("appeals-invite").fill("https://discord.gg/altserver");
    await expect(page.getByTestId("appeals-preview")).toContainText("Bine ai revenit pe numele serverului");
    await expect(page.getByTestId("appeals-preview")).toContainText("Hai înapoi");

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect((savedConfigs.get(guilds[0].id) as any).appeals).toMatchObject({
      enabled: true, channelId: "444444444", unbanOnAccept: false, cooldownDays: 14,
      acceptedTitle: "Bine ai revenit pe {guild}", acceptedButton: "Hai înapoi", inviteUrl: "https://discord.gg/altserver",
    });
    await page.reload();
    await expect(page.getByRole("switch", { name: "Activează contestațiile de pe site" })).toBeChecked();
    await expect(page.getByTestId("appeals-cooldown")).toHaveValue("14");
  });

  test("ban evasion alerts are turned on with a channel and the comparisons, and saved", async ({ page }) => {
    await page.unroute("**/api/moderation/guilds/*/metadata");
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      await route.fulfill({
        json: {
          guild: { id: guilds[0].id, name: guilds[0].name, ownerId: "999999999" },
          roles: [],
          channels: [{ id: "444444444", name: "alerte-staff", type: 0, parentId: null }],
          botCapabilities: { online: true, messageContent: true, guildMembers: true },
        },
      });
    });
    await page.goto("/moderare/sanctiuni/ocolire-ban");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Ocolirea banului" })).toBeVisible();
    await page.getByRole("switch", { name: "Activează verificarea conturilor noi" }).click();
    await expect(page.getByText("Alege canalul, altfel alertele nu ajung la nimeni.")).toBeVisible();
    await page.getByRole("combobox", { name: "Canalul alertelor de ocolire" }).selectOption("444444444");
    await page.getByTestId("evasion-avatar").click();
    await page.getByTestId("evasion-watch").fill("60");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect((savedConfigs.get(guilds[0].id) as any).banEvasion).toMatchObject({ enabled: true, alertChannelId: "444444444", matchAvatar: false, watchDays: 60 });
    await expect(page.getByTestId("nav-sanctions-evasion")).toContainText("ultimele 60 zile");
  });

  test("a banned person signs in, appeals, answers a question and sees the result on the public page", async ({ page }) => {
    const view = (over: Record<string, unknown> = {}) => ({
      enabled: true, guild: { id: "111111111", name: "Regatul Cenușii", iconUrl: null }, banned: true,
      ban: { reason: "spam în #general", caseId: "c1", at: null }, appeal: null, canAppeal: true, nextAllowedAt: null, inviteUrl: null, ...over,
    });
    const pending = { id: "a1", status: "pending", body: "x".repeat(40), createdAt: "2026-10-01T10:00:00Z", decidedAt: null, decisionNote: null, question: null };
    let signedIn = false;
    let status: Record<string, unknown> = view();
    const posts: Array<{ url: string; body: any }> = [];
    await page.route("**/api/moderation/appeals/session**", async (route) => {
      await route.fulfill({ json: signedIn
        ? { authenticated: true, user: { id: "234567890123456789", name: "Ana", username: "ana", avatar: null }, status }
        : { authenticated: false, enabled: true } });
    });
    await page.route("**/api/moderation/appeals", async (route) => {
      posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
      status = view({ canAppeal: false, appeal: pending });
      await route.fulfill({ json: { status } });
    });
    await page.route("**/api/moderation/appeals/answer", async (route) => {
      posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
      status = view({ canAppeal: false, appeal: pending });
      await route.fulfill({ json: { status } });
    });

    await page.goto("/contestatie?guildId=111111111");
    await expect(page.getByRole("heading", { name: "Contestă banul" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Conectează-te cu Discord" })).toHaveAttribute("href", "/api/moderation/oauth/discord?appeal=1&guildId=111111111");

    signedIn = true;
    await page.reload();
    await expect(page.getByText("spam în #general")).toBeVisible();
    const send = page.getByRole("button", { name: "Trimite contestația" });
    await expect(send).toBeDisabled();
    await page.getByLabel("Ce s-a întâmplat și de ce să fie scos banul?").fill("Am greșit și îmi pare rău, nu se va mai repeta.");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText("Contestația ta a ajuns la staff.")).toBeVisible();
    expect(posts[0]!.body).toMatchObject({ guildId: "111111111", text: "Am greșit și îmi pare rău, nu se va mai repeta." });

    status = view({ canAppeal: false, appeal: { ...pending, question: { id: "q1", text: "Ai mai fost banat?" } } });
    await page.reload();
    await expect(page.getByText("Ai mai fost banat?")).toBeVisible();
    await page.getByLabel("Răspunsul tău").fill("Nu, prima dată.");
    await page.getByRole("button", { name: "Trimite răspunsul" }).click();
    await expect(page.getByText("Contestația ta a ajuns la staff.")).toBeVisible();
    expect(posts[1]!.body).toMatchObject({ clarificationId: "q1", text: "Nu, prima dată." });

    status = view({ canAppeal: false, nextAllowedAt: "2026-11-15T00:00:00Z", appeal: { ...pending, status: "rejected", decidedAt: "2026-10-16T00:00:00Z", decisionNote: "Prea devreme." } });
    await page.reload();
    await expect(page.getByText("Contestația a fost respinsă.")).toBeVisible();
    await expect(page.getByText("Poți face o contestație nouă după 15 noiembrie 2026.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trimite contestația" })).toHaveCount(0);

    status = view({ banned: false, canAppeal: false, appeal: { ...pending, status: "accepted", decidedAt: "2026-10-20T00:00:00Z" }, inviteUrl: "https://discord.gg/regatulcenusii", inviteLabel: "Intră în regat" });
    await page.reload();
    await expect(page.getByText("Contestația a fost acceptată.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Intră în regat" })).toHaveAttribute("href", "https://discord.gg/regatulcenusii");

    await page.goto("/contestatie?guildId=111111111&appeal_error=cancelled");
    await expect(page.getByRole("alert")).toContainText("Ai anulat conectarea cu Discord");
  });

  test("the older addresses of sanctions settings open the new page", async ({ page }) => {
    await page.goto("/moderare/config/unelte");
    await chooseFirstGuild(page);
    await expect(page).toHaveURL("/moderare/sanctiuni/comenzi");
    await expect(page.getByRole("heading", { name: "Comenzi de moderare" })).toBeVisible();
    await page.goto("/moderare/config/escaladare");
    await expect(page).toHaveURL("/moderare/sanctiuni/escaladare");
    await expect(page.getByRole("heading", { name: "Escaladarea sancțiunilor" })).toBeVisible();
  });

  test("link blocking can target multiple channels or all channels and persists after reload", async ({ page }) => {
    await page.unroute("**/api/moderation/guilds/*/metadata");
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      await route.fulfill({
        json: {
          guild: { id: guilds[0].id, name: guilds[0].name, ownerId: "999999999" },
          roles: [],
          channels: [
            { id: "444444444", name: "audit", type: 0, parentId: null },
            { id: "555555555", name: "general", type: 0, parentId: null },
            { id: "666666666", name: "voice", type: 2, parentId: null },
          ],
          emojis: [],
          botCapabilities: { online: true, messageContent: true, guildMembers: true },
        },
      });
    });
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    await page.getByTestId("rule-automod-linkBlock-open").click();

    const auditChannel = page.getByRole("checkbox", { name: "#audit" });
    const generalChannel = page.getByRole("checkbox", { name: "#general" });
    await expect(auditChannel).toBeVisible();
    await expect(generalChannel).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "#voice" })).toHaveCount(0);

    await auditChannel.check();
    await generalChannel.check();
    const saveSelection = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    await expect((await saveSelection).ok()).toBeTruthy();
    expect(savedConfigs.get(guilds[0].id)?.autoMod.linkBlock.channelIds).toEqual(["444444444", "555555555"]);

    await page.reload();
    await page.getByTestId("rule-automod-linkBlock-open").click();
    await expect(page.getByRole("checkbox", { name: "#audit" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "#general" })).toBeChecked();

    await page.getByRole("checkbox", { name: "Toate canalele" }).click();
    const saveAllChannels = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    await expect((await saveAllChannels).ok()).toBeTruthy();
    expect(savedConfigs.get(guilds[0].id)?.autoMod.linkBlock.channelIds).toEqual([]);
  });

  test("renders every moderation destination instead of the work-in-progress fallback", async ({ page }) => {
    await page.goto("/moderare");
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
        routes: ["/sanctiuni", "/comenzi", "/cazuri", "/audit"],
      },
      {
        group: "configuration",
        routes: ["/config", "/setari", "/jurnale", "/setari/notificari"],
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
          channelId: "", title: "Statistici {guild}", description: "Raport {date}", color: "#5865F2", footer: "Oracolul",
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
    await expect(page).toHaveURL("/moderare/control/canale");
    await expect(page.getByTestId("control-page")).toBeVisible();

    await page.goto("/moderare/canale");
    await expect(page).toHaveURL("/moderare/joc/canale");
    await expect(page.getByRole("heading", { name: "Canalele jocului", exact: true })).toBeVisible();
    await page.getByLabel("Canal Cufere ID fallback").fill("555555555");
    const channelSave = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    await expect((await channelSave).ok()).toBeTruthy();
    expect(savedMainChannel).toBe("555555555");

    await page.goto("/moderare/bot?tab=channels");
    await expect(page).toHaveURL("/moderare/joc/canale");
    await page.goto("/moderare/bot?tab=messages");
    await expect(page).toHaveURL("/moderare/joc");

    // The old statistics tab now opens the invitations of the bot control.
    await page.goto("/moderare/bot?tab=statistics");
    await expect(page).toHaveURL("/moderare/control/invitatii");
    await expect(page.getByTestId("control-invites-log")).toBeVisible();
    await page.getByTestId("control-invites-switch").click();
    await page.getByRole("combobox", { name: "Canalul jurnalului de intrări" }).selectOption("444444444");
    await page.getByTestId("nav-control-daily").click();
    await expect(page.getByTestId("control-daily-preview")).toContainText("Activitate · ultimele 7 zile");
    await expect(page.getByTestId("control-daily-preview")).toContainText("Top 5 canale active");
    await page.getByRole("combobox", { name: "Canalul raportului zilnic" }).selectOption("444444444");
    const configSave = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control")
      && response.request().method() === "PUT");
    await page.getByTestId("button-save-control").click();
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
    await expect(page.getByTestId("audit-list")).toContainText("Configurație actualizată");
    await expect(page.getByTestId("audit-list")).toContainText("Anti-Raid a fost activat.");
    await page.getByTestId("audit-search").fill("toxicitate");
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toBeVisible();
    await expect(page.getByText("Configurație actualizată")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Categorie" }).selectOption({ label: "Securitate" });
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
    await expect(page.getByRole("combobox", { name: "Categorie" })).toHaveValue("security");
    await expect(page.getByTestId("audit-search")).toHaveValue("toxicitate");
    await expect(page.getByText("Mesaj semnalat de moderarea AI")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Până la", { exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/audit-date-range-mobile.png", fullPage: true });
  });

  test("switches guilds without displaying stale config and persists a full save", async ({ page }) => {
    // The old advanced settings address opens the bot settings.
    await page.goto("/moderare/config/avansat");
    await chooseFirstGuild(page);
    await expect(page).toHaveURL("/moderare/setari/acces");
    await expect(page.getByRole("combobox").first()).toContainText("Cenușa Nordului");
    const guildSelector = page.getByRole("combobox").first();
    await guildSelector.click();
    await page.getByRole("option", { name: "Turnul Gol" }).click();
    await expect(page.getByRole("combobox").first()).toContainText("Turnul Gol");

    await expect(page.getByTestId("settings-manage-guild")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("settings-manage-guild").click();
    const saveResponse = page.waitForResponse((response) => response.url().includes("/api/moderation/guilds/222222222/config") && response.request().method() === "PUT");
    await page.getByTestId("button-save-settings").click();
    await expect((await saveResponse).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("settings-manage-guild")).toHaveAttribute("aria-checked", "false");
    expect(savedConfigs.get("111111111")!.permissions.allowManageGuild).not.toBe(false);
  });

  test("shows when a saved moderation destination is unavailable and lets the operator replace it", async ({ page }) => {
    savedConfigs.get(guilds[0].id)!.audit.channelId = "555555555";
    await page.goto("/moderare/jurnale/audit");
    await chooseFirstGuild(page);

    const unavailableWarning = page.getByRole("alert").filter({
      hasText: "Canalul salvat nu este disponibil ca text",
    });
    await expect(unavailableWarning).toBeVisible();
    await page.getByLabel(/ID fallback/).first().fill("444444444");
    await expect(unavailableWarning).toHaveCount(0);
  });

  test("configuration overview shows status and sends module changes to the dedicated editor", async ({ page }) => {
    await page.goto("/moderare/config");
    await chooseFirstGuild(page);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await page.getByTestId("link-config-module-autoMod").click();
    await expect(page).toHaveURL("/moderare/automod");
    await expect(page.getByRole("switch", { name: "Activează AutoMod" })).not.toBeChecked();
    await expect(page.getByText("Discord AutoMod nativ:")).toBeVisible();
  });

  test("global protection and role-channel policies each have one canonical editor", async ({ page }) => {
    await page.goto("/moderare/protectie");
    await chooseFirstGuild(page);
    const globalSwitch = page.getByRole("switch", { name: "Activează sau oprește toate modulele de protecție" });
    await expect(globalSwitch).toHaveCount(1);
    await expect(globalSwitch).toBeChecked();
    // "/protectie" opens the first module of the group, with all five in its menu.
    await expect(page.getByRole("heading", { name: "AutoMod pentru mesaje" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Modulele de protecție" }).getByRole("link")).toHaveCount(5);
    await expect(page.getByTestId("nav-module-automod")).toHaveAttribute("aria-current", "page");

    await globalSwitch.click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.protection.enabled).toBe(false);
    await expect(globalSwitch).not.toBeChecked();

    await page.goto("/moderare/politici");
    await expect(page.getByText("Roluri protejate")).toBeVisible();
    await expect(page.getByText("Canale stricte")).toBeVisible();
    await expect(page.getByText("Escaladare Automată")).toHaveCount(0);
  });

  test("category save reapplies only its fields to the latest server snapshot", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);

    await page.getByTestId("rule-automod-wordFilter-open").click();
    await page.getByLabel("Cuvinte interzise", { exact: true }).fill("valoare-salvată");
    await page.getByLabel("Cuvinte interzise", { exact: true }).press("Enter");

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
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await expect(page.getByRole("button", { name: "Șterge valoare-salvată" })).toBeVisible();
  });

  test("saves an enabled module and rule, then rehydrates both after reload", async ({ page }) => {
    await page.goto("/moderare/anti-raid");
    await chooseFirstGuild(page);

    await page.getByRole("switch", { name: "Activează anti-raid" }).click();
    await page.getByRole("switch", { name: "Regula de raid" }).click();
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
    await expect(page.getByRole("switch", { name: "Regula de raid" })).toBeChecked();
    await expect(page.getByLabel("Intrări pe minut")).toHaveValue("24");
  });

  test("activity logs switched on without any category are not sent and the draft stays", async ({ page }) => {
    const configPuts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/moderation/guilds/111111111/config") && request.method() === "PUT") {
        configPuts.push(request.url());
      }
    });
    await page.goto("/moderare/jurnale/activitate");
    await chooseFirstGuild(page);
    const logToggle = page.getByRole("switch", { name: "Activează jurnalele de activitate" });
    await logToggle.click();
    for (const name of ["Mesaje", "Membri", "Canale", "Roluri", "Voce", "Moderare", "Securitate"]) {
      await page.getByRole("switch", { name, exact: true }).click();
    }
    await expect(page.getByTestId("module-activity")).toContainText("Alege cel puțin o categorie");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    // The page refuses before sending anything (a notice says why).
    await expect(page.getByTestId("logs-save-bar")).toBeVisible();

    expect(configPuts).toEqual([]);
    await expect(logToggle).toBeChecked();
    await expect(page.getByRole("button", { name: "Salvează", exact: true })).toBeVisible();
  });

  test("rejects an invalid animation GIF URL and preserves the draft", async ({ page }) => {
    const configPuts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/moderation/guilds/111111111/config") && request.method() === "PUT") {
        configPuts.push(request.url());
      }
    });
    // The old embeds address opens the notifications of the bot settings.
    await page.goto("/moderare/config/embeduri");
    await chooseFirstGuild(page);
    await expect(page).toHaveURL("/moderare/setari/notificari");
    const animationToggle = page.getByTestId("settings-embed-animation");
    await animationToggle.click();
    const animationUrl = page.getByTestId("settings-embed-gif");
    await animationUrl.fill("https://example.com/not-a-gif.png");

    await expect(page.getByRole("alert").filter({ hasText: "Linkul trebuie să fie HTTPS public și să se termine în .gif." })).toBeVisible();
    await page.getByTestId("button-save-settings").click();

    expect(configPuts).toEqual([]);
    await expect(animationToggle).toHaveAttribute("aria-checked", "true");
    await expect(animationUrl).toHaveValue("https://example.com/not-a-gif.png");
    await expect(page.getByTestId("button-save-settings")).toBeVisible();
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

  test("switching the activity logs on sends the chosen categories and keeps them after reload", async ({ page }) => {
    await page.goto("/moderare/jurnale/activitate");
    await chooseFirstGuild(page);
    const logToggle = page.getByRole("switch", { name: "Activează jurnalele de activitate" });
    await logToggle.click();
    await page.getByRole("switch", { name: "Voce", exact: true }).click();
    await page.getByTestId("activity-messages-open").click();
    await page.getByLabel("Canal pentru Mesaje", { exact: true }).selectOption("444444444");
    await expect(page.getByTestId("activity-pending")).toContainText("Membri, Canale, Roluri, Moderare, Securitate");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.activityLog).toMatchObject({
      enabled: true,
      categories: { messages: true, members: true, voice: false },
      channelIds: { messages: "444444444" },
    });
    await page.reload();
    await expect(logToggle).toBeChecked();
    await expect(page.getByRole("switch", { name: "Voce", exact: true })).not.toBeChecked();
  });

  test("the messages page lists every message and links to where it is edited", async ({ page }) => {
    await page.goto("/moderare/config/mesaje");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Toate mesajele botului" })).toBeVisible();
    await expect(page.getByTestId("catalog-dm")).toContainText("Setări bot → Mesaje în privat");
    await page.getByTestId("catalog-notices").click();
    await expect(page).toHaveURL("/moderare/setari/notificari");
    await page.goto("/moderare/config/mesaje");
    await page.getByTestId("catalog-logs").click();
    await expect(page).toHaveURL("/moderare/config/mesaje/jurnale");
    await expect(page.getByRole("heading", { name: "Textele jurnalelor de activitate" })).toBeVisible();
  });

  test("log texts preview, save only what changed and can go back to the default", async ({ page }) => {
    await page.goto("/moderare/config/mesaje/jurnale");
    await chooseFirstGuild(page);
    await page.getByTestId("logs-tab-members").click();
    await page.getByTestId("log-member_join-open").click();
    await page.getByTestId("log-member_join-title").fill("Bun venit, ");
    await page.getByRole("button", { name: "Inserează {member_name}", exact: true }).click();
    await expect(page.getByTestId("log-member_join-title")).toHaveValue("Bun venit, {member_name}");
    await page.getByTestId("log-member_join-description").fill("A intrat {member} · vechime {account_age}.");
    await expect(page.getByTestId("log-member_join-preview")).toContainText("Bun venit, Adina pe server");
    await expect(page.getByTestId("log-member_join-preview")).toContainText("A intrat @Adina · vechime 2 ani, 7 luni.");

    await page.getByTestId("logs-tab-messages").click();
    await page.getByTestId("log-message_update-open").click();
    await page.getByTestId("log-message_update-title").fill("Editare în {channel}");
    await expect(page.getByTestId("nav-messages-logs").getByRole("img", { name: "are modificări nesalvate" })).toBeVisible();

    // Meanwhile another screen changed a channel and another log's text: both must stay.
    (savedConfigs.get(guilds[0].id)!.activityLog as any).templates = { channel_create: { title: "Canal nou", description: "" } };
    savedConfigs.get(guilds[0].id)!.activityLog.channelIds.messages = "777777777";
    const save = page.waitForResponse((response) => response.url().includes("/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await save).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)!.activityLog).toMatchObject({
      channelIds: { messages: "777777777" },
      memberJoinTitleTemplate: "Bun venit, {member_name}",
      memberJoinDescriptionTemplate: "A intrat {member} · vechime {account_age}.",
      templates: {
        channel_create: { title: "Canal nou" },
        message_update: { title: "Editare în {channel}", description: "" },
        member_join: { title: "Bun venit, {member_name}" },
      },
    });

    await page.reload();
    await page.getByTestId("log-message_update-open").click();
    await expect(page.getByTestId("log-message_update-title")).toHaveValue("Editare în {channel}");
    await page.getByTestId("log-message_update-reset").click();
    await expect(page.getByTestId("log-message_update-title")).toHaveValue("");
    await expect(page.getByTestId("log-message_update-preview")).toContainText("Mesaj editat");
  });

  test("the moderation notice text is edited with the notices settings", async ({ page }) => {
    await page.goto("/moderare/setari/notificari");
    await chooseFirstGuild(page);
    await page.getByTestId("settings-template-title").fill("Acțiune: {member}");
    const save = page.waitForResponse((response) => response.url().includes("/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await save).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.embeds).toMatchObject({ titleTemplate: "Acțiune: {member}" });
  });

  test("the game is turned on, its channels, events, missions and economy are set and saved together", async ({ page }) => {
    let botConfig: any = {
      channels: {},
      provisioningPermissions: {},
      discordLive: true,
      verification: {
        enabled: false, channelId: "", roleId: "", title: "", message: "", buttonLabel: "",
        buttonEmoji: "", successMessage: "", alreadyVerifiedMessage: "", imageUrl: "", thumbnailUrl: "", panelMessageId: "",
      },
      gameplayConfig: {
        memberMessages: { channelId: "", style: "normal", welcomeEnabled: false, leaveEnabled: false, customStyle: "" },
        messages: { gamePaused: "", gamePausedImageUrl: "", gamePausedThumbnailUrl: "", oraclePaused: "", oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "" },
        paused: true, events: {}, missions: {}, economy: {},
      },
      allianceRecruitmentText: "",
      dailyStats: {
        channelId: "", title: "Statistici {guild}", description: "Raport {date}", color: "#5865F2", footer: "",
        activityTitle: "Activitate · ultimele 7 zile", channelsTitle: "Top 5 canale active",
        emptyChannelsText: "Nu există canale active.", imageUrl: "https://example.com/report.png", thumbnailUrl: "",
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
    };
    await page.route("**/api/moderation/guilds/*/bot-control", async (route) => {
      if (route.request().method() === "PUT") {
        botConfig = { ...JSON.parse(route.request().postData() || "{}"), discordLive: true };
        await route.fulfill({ json: botConfig });
        return;
      }
      await route.fulfill({ json: structuredClone(botConfig) });
    });
    await page.route("**/api/moderation/guilds/*/invite-stats**", async (route) => {
      await route.fulfill({ json: { range: "7", startDay: "2026-09-18", endDay: "2026-09-24", totals: { attributedJoins: 0, unknownJoins: 0 }, rows: [] } });
    });

    let paused = true;
    const statePuts: boolean[] = [];
    await page.route("**/api/moderation/guilds/*/gameplay-state", async (route) => {
      if (route.request().method() === "PUT") {
        paused = JSON.parse(route.request().postData() || "{}").paused;
        statePuts.push(paused);
      }
      await route.fulfill({ json: { paused } });
    });
    await page.goto("/moderare/joc");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Starea jocului" })).toBeVisible();
    await expect(page.getByTestId("game-summary")).toContainText("Oprit");
    // Turning on applies at once, through its own route.
    await page.getByRole("switch", { name: "Jocul rulează pe server" }).click();
    await expect(page.getByTestId("game-summary")).toContainText("Pornit");
    expect(statePuts).toEqual([false]);
    await expect(page.getByText("Jocul e pornit, dar n-ai ales niciun canal")).toBeVisible();
    // Turning off asks first.
    await page.getByRole("switch", { name: "Jocul rulează pe server" }).click();
    await expect(page.getByTestId("game-stop-confirm")).toBeVisible();
    await page.getByRole("button", { name: "Renunță", exact: true }).first().click();
    expect(statePuts).toEqual([false]);
    await page.getByTestId("game-paused-text").getByRole("textbox").fill("Jocul doarme. Revenim curând.");

    await page.getByTestId("nav-game-channels").click();
    await page.getByRole("combobox", { name: "Canalul pentru Ora Umbrelor" }).selectOption("444444444");
    await expect(page.getByTestId("nav-game-channels")).toContainText("1 din 8 canale alese");

    await page.getByTestId("nav-game-events").click();
    await page.getByTestId("game-eventCooldownMinMinutes").fill("200");
    await expect(page.getByText("Pauza maximă trebuie să fie cel puțin cât cea minimă.")).toBeVisible();
    await page.getByTestId("game-eventCooldownMaxMinutes").fill("300");
    await expect(page.getByTestId("game-events-day")).toBeVisible();

    await page.getByTestId("nav-game-missions").click();
    await page.getByTestId("game-kill_10-target").fill("15");

    await page.getByTestId("nav-game-economy").click();
    await page.getByTestId("game-economy-double").click();
    await expect(page.getByTestId("game-monsterGoldMultiplier")).toHaveValue("2");

    const save = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control") && response.request().method() === "PUT");
    await page.getByTestId("button-save-game").click();
    expect((await save).ok()).toBe(true);
    expect(botConfig.gameplayConfig).toMatchObject({
      messages: { gamePaused: "Jocul doarme. Revenim curând." },
      events: { eventCooldownMinMinutes: 200, eventCooldownMaxMinutes: 300 },
      missions: { kill_10: { target: 15 } },
      economy: { monsterGoldMultiplier: 2, monsterXpMultiplier: 2, bossGoldMultiplier: 2, bossXpMultiplier: 2 },
    });
    expect(botConfig.channels.event).toBe("444444444");
    // The rest of the bot's settings go back unchanged.
    expect(botConfig.dailyStats.imageUrl).toBe("https://example.com/report.png");
    await page.reload();
    await expect(page.getByTestId("game-summary")).toContainText("Pornit");
  });

  test("the alliance announcement is edited with variables, previewed, reset and saved", async ({ page }) => {
    let botConfig: any = {
      channels: {},
      provisioningPermissions: {},
      discordLive: true,
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
        emptyChannelsText: "Nu există canale active.", imageUrl: "https://example.com/report.png", thumbnailUrl: "",
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
    };
    await page.route("**/api/moderation/guilds/*/bot-control", async (route) => {
      if (route.request().method() === "PUT") {
        botConfig = { ...JSON.parse(route.request().postData() || "{}"), discordLive: true };
        await route.fulfill({ json: botConfig });
        return;
      }
      await route.fulfill({ json: structuredClone(botConfig) });
    });
    await page.route("**/api/moderation/guilds/*/invite-stats**", async (route) => {
      await route.fulfill({ json: { range: "7", startDay: "2026-09-18", endDay: "2026-09-24", totals: { attributedJoins: 0, unknownJoins: 0 }, rows: [] } });
    });

    await page.goto("/moderare/config/mesaje/alianta");
    await chooseFirstGuild(page);
    const text = page.getByTestId("alliance-template");
    // An empty saved text means the standard one: the field is empty and the preview shows it.
    await expect(text).toHaveValue("");
    await expect(page.getByTestId("alliance-preview")).toContainText("PACTUL CELOR DOUĂ REGATE");
    await text.fill("Pact nou cu ");
    await page.getByRole("button", { name: "Inserează {server_name}", exact: true }).click();
    await expect(text).toHaveValue("Pact nou cu {server_name}");
    await expect(page.getByTestId("alliance-preview")).toContainText("Pact nou cu Taverna Dragonului");
    const allianceSave = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/bot-control") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await allianceSave).ok()).toBe(true);
    expect(botConfig.tickets.allianceAnnouncementTemplate).toBe("Pact nou cu {server_name}");
    // The rest of the bot's settings are sent back unchanged.
    expect(botConfig.dailyStats.imageUrl).toBe("https://example.com/report.png");
    await page.reload();
    await expect(page.getByTestId("alliance-template")).toHaveValue("Pact nou cu {server_name}");
    await page.getByTestId("alliance-reset").click();
    await expect(page.getByTestId("alliance-template")).toHaveValue("");
    await expect(page.getByTestId("alliance-preview")).toContainText("PACTUL CELOR DOUĂ REGATE");
  });

  test("invalid JSON changes nothing and a valid import applies only the previewed section", async ({ page }) => {
    const targetConfig = fullConfig();
    targetConfig.cases.retentionDays = 42;
    targetConfig.bot.prefix = "$";
    savedConfigs.set(guilds[0].id, structuredClone(targetConfig));

    await openConfigTools(page);
    await page.getByTestId("button-import-config").click();
    const editor = page.getByLabel("JSON de importat");
    await editor.fill("{");
    await page.getByTestId("button-preview-import").click();

    await expect(page.getByTestId("text-action-status")).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("preview-changed-sections")).toHaveCount(0);
    await expect(page.getByTestId("button-confirm-operation")).toHaveCount(0);
    expect(configRequests.filter((request) => request.method === "PUT")).toHaveLength(0);
    expect(savedConfigs.get(guilds[0].id)).toEqual(targetConfig);

    const importedAutoMod = structuredClone(targetConfig.autoMod);
    importedAutoMod.enabled = true;
    await editor.fill(JSON.stringify({
      format: "oracol-cenusii-config",
      version: 1,
      config: { autoMod: importedAutoMod },
    }));
    await page.getByTestId("button-preview-import").click();
    const preview = page.getByTestId("preview-changed-sections");
    await expect(preview).toBeVisible();
    await expect(preview.locator("li")).toHaveCount(1);
    await expect(preview).toContainText("AutoMod");
    await page.getByTestId("button-confirm-operation").click();
    await expect(page.getByTestId("text-action-status")).toContainText("aplicate cu succes");

    const saved = savedConfigs.get(guilds[0].id)!;
    expect(saved.autoMod).toEqual(importedAutoMod);
    expect(saved.cases).toEqual(targetConfig.cases);
    expect(saved.bot).toEqual(targetConfig.bot);
    const writes = configRequests.filter((request) => request.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ guildId: guilds[0].id, body: { autoMod: importedAutoMod } });
  });

  test("copy reads only the authorized source and writes only the selected target", async ({ page }) => {
    const targetConfig = fullConfig();
    const sourceConfig = fullConfig();
    targetConfig.autoMod.enabled = false;
    sourceConfig.autoMod.enabled = true;
    targetConfig.cases.retentionDays = 77;
    sourceConfig.cases.retentionDays = 77;
    savedConfigs.set(guilds[0].id, structuredClone(targetConfig));
    savedConfigs.set(guilds[1].id, structuredClone(sourceConfig));
    caseHistory.set(guilds[0].id, [{ id: `case-${guilds[0].id}` }]);
    auditHistory.set(guilds[0].id, [{ id: `audit-${guilds[0].id}` }]);
    const sourceBefore = structuredClone(sourceConfig);

    await openConfigTools(page);
    await page.getByTestId("button-copy-server-config").click();
    await expect(page.getByTestId("button-preview-copy")).toBeEnabled();
    await expect(page.getByTestId("text-copy-guild-pair")).toContainText(`Sursă: ${guilds[1].name}`);
    await expect(page.getByTestId("text-copy-guild-pair")).toContainText(`Țintă: ${guilds[0].name}`);
    await page.getByTestId("button-preview-copy").click();
    const preview = page.getByTestId("preview-changed-sections");
    await expect(preview.locator("li")).toHaveCount(1);
    await expect(preview).toContainText("AutoMod");
    await page.getByTestId("button-confirm-operation").click();
    await expect(page.getByTestId("text-action-status")).toContainText("aplicate cu succes");

    expect(savedConfigs.get(guilds[1].id)).toEqual(sourceBefore);
    expect(savedConfigs.get(guilds[0].id)?.autoMod).toEqual(sourceConfig.autoMod);
    expect(savedConfigs.get(guilds[0].id)?.cases).toEqual(targetConfig.cases);
    const sourceRequests = configRequests.filter((request) => request.guildId === guilds[1].id);
    const targetRequests = configRequests.filter((request) => request.guildId === guilds[0].id);
    expect(sourceRequests.length).toBeGreaterThan(0);
    expect(sourceRequests.every((request) => request.method === "GET")).toBe(true);
    expect(targetRequests.some((request) => request.method === "PUT")).toBe(true);
    expect(configRequests.filter((request) => request.method === "PUT").map((request) => request.guildId)).toEqual([guilds[0].id]);
  });

  test("reset changes only the selected server config and leaves cases, audit, and the other server intact", async ({ page }) => {
    const targetConfig = fullConfig();
    const sourceConfig = fullConfig();
    targetConfig.autoMod.enabled = true;
    targetConfig.cases.retentionDays = 21;
    sourceConfig.autoMod.enabled = true;
    sourceConfig.bot.prefix = "?";
    savedConfigs.set(guilds[0].id, structuredClone(targetConfig));
    savedConfigs.set(guilds[1].id, structuredClone(sourceConfig));
    const sourceBefore = structuredClone(sourceConfig);
    const casesBefore = structuredClone([...caseHistory.entries()]);
    const auditBefore = structuredClone([...auditHistory.entries()]);

    await openConfigTools(page);
    await page.getByTestId("button-reset-config").click();
    await expect(page.getByRole("dialog")).toContainText("Istoricul cazurilor/auditului și celelalte servere nu vor fi șterse sau afectate.");
    await page.getByTestId("button-confirm-reset").click();
    await expect(page.getByTestId("text-action-status")).toContainText("resetată la valorile implicite");

    expect(configRequests.filter((request) => request.method === "PUT")).toEqual([
      { guildId: guilds[0].id, method: "PUT", body: {} },
    ]);
    expect(savedConfigs.get(guilds[0].id)).toEqual(fullConfig());
    expect(savedConfigs.get(guilds[1].id)).toEqual(sourceBefore);
    expect([...caseHistory.entries()]).toEqual(casesBefore);
    expect([...auditHistory.entries()]).toEqual(auditBefore);
    expect(historyRequests.every((request) => request.method === "GET")).toBe(true);
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
    await page.getByTestId("rule-automod-wordFilter-open").click();
    const words = page.getByLabel("Cuvinte interzise", { exact: true });
    await words.fill("prima");
    await words.press("Enter");
    const request = page.waitForRequest((item) =>
      item.url().includes("/guilds/111111111/config") && item.method() === "PUT");
    await page.getByRole("button", { name: "Salvează" }).click();
    await request;
    await words.fill("a doua");
    await words.press("Enter");
    releaseSave();
    await expect(page.getByRole("button", { name: "Șterge prima" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Șterge a doua" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvează" })).toBeEnabled();
    expect(savedConfigs.get(guilds[0].id)?.autoMod.forbiddenWords).toEqual(["prima"]);
  });

  test("AutoMod word and link rules combine deletion with a member sanction and persist", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await page.getByTestId("rule-automod-linkBlock-open").click();

    const wordActions = page.getByTestId("actions-Filtru cuvinte");
    await expect(wordActions).toBeVisible();
    await wordActions.getByRole("checkbox", { name: "Șterge mesajul" }).click();
    await wordActions.getByRole("checkbox", { name: "Avertisment" }).click();
    await expect(wordActions.getByTestId("actions-Filtru cuvinte-summary"))
      .toContainText("Șterge mesajul + Avertisment");

    const linkActions = page.getByTestId("actions-Blocare linkuri");
    await linkActions.getByRole("checkbox", { name: "Șterge mesajul" }).click();
    await linkActions.getByRole("checkbox", { name: "Mute" }).click();
    await expect(linkActions.getByTestId("actions-Blocare linkuri-summary"))
      .toContainText("Șterge mesajul + Mute");

    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    expect(savedConfigs.get(guilds[0].id)?.autoMod.wordFilter)
      .toMatchObject({ action: "warn", deleteMessage: true });
    expect(savedConfigs.get(guilds[0].id)?.autoMod.linkBlock)
      .toMatchObject({ action: "mute", deleteMessage: true });

    await page.reload();
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await page.getByTestId("rule-automod-linkBlock-open").click();
    await expect(page.getByTestId("actions-Filtru cuvinte")).toBeVisible();
    await expect(page.getByTestId("actions-Filtru cuvinte")
      .getByRole("checkbox", { name: "Șterge mesajul" })).toBeChecked();
    await expect(page.getByTestId("actions-Filtru cuvinte")
      .getByRole("checkbox", { name: "Avertisment" })).toBeChecked();
    await expect(page.getByTestId("actions-Blocare linkuri")
      .getByRole("checkbox", { name: "Șterge mesajul" })).toBeChecked();
    await expect(page.getByTestId("actions-Blocare linkuri")
      .getByRole("checkbox", { name: "Mute" })).toBeChecked();
  });

  test("protection ticks save a deletion, a warning, a sanction, a staff alert and the mute length", async ({ page }) => {
    await page.goto("/moderare/anti-spam");
    await chooseFirstGuild(page);
    await page.getByRole("switch", { name: "Activează anti-spam" }).click();
    await page.getByRole("switch", { name: "Spam de mesaje" }).click();
    await page.getByTestId("rule-antispam-message-open").click();

    const ticks = page.getByTestId("actions-Spam de mesaje");
    await ticks.getByRole("checkbox", { name: "Șterge mesajul" }).click();
    await ticks.getByRole("checkbox", { name: "Avertisment" }).click();
    await ticks.getByRole("checkbox", { name: "Mute" }).click();
    await ticks.getByLabel("Durata mute-ului (minute)").fill("45");
    await ticks.getByRole("checkbox", { name: "Anunță staff-ul" }).click();
    await expect(page.getByTestId("actions-Spam de mesaje-summary"))
      .toContainText("Șterge mesajul + Avertisment + Mute 45 de minute + Anunță staff-ul");

    // Mute, kick and ban exclude each other; the warning stays next to the new sanction.
    await ticks.getByRole("checkbox", { name: "Ban" }).click();
    await expect(ticks.getByRole("checkbox", { name: "Mute" })).not.toBeChecked();
    await ticks.getByRole("checkbox", { name: "Mute" }).click();
    await expect(ticks.getByRole("checkbox", { name: "Ban" })).not.toBeChecked();
    await expect(ticks.getByRole("checkbox", { name: "Avertisment" })).toBeChecked();

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.antiSpam).toMatchObject({
      enabled: true,
      message: { enabled: true, action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 45 },
    });

    await page.reload();
    await page.getByTestId("rule-antispam-message-open").click();
    for (const name of ["Șterge mesajul", "Avertisment", "Mute", "Anunță staff-ul"]) {
      await expect(page.getByTestId("actions-Spam de mesaje").getByRole("checkbox", { name })).toBeChecked();
    }
    await expect(page.getByTestId("actions-Spam de mesaje").getByLabel("Durata mute-ului (minute)")).toHaveValue("45");
  });

  test("unsaved protection changes stay while moving between modules and are saved together", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await page.getByLabel("Cuvinte interzise", { exact: true }).fill("nord");
    await page.getByLabel("Cuvinte interzise", { exact: true }).press("Enter");

    await page.getByTestId("nav-module-antiraid").click();
    await expect(page).toHaveURL("/moderare/anti-raid");
    await expect(page.getByTestId("protection-save-bar")).toContainText("AutoMod");
    await page.getByRole("switch", { name: "Activează anti-raid" }).click();
    await expect(page.getByTestId("protection-save-bar")).toContainText("Anti-raid");

    await page.getByTestId("nav-module-automod").click();
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await expect(page.getByRole("button", { name: "Șterge nord" })).toBeVisible();

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(configRequests.filter((request) => request.method === "PUT")).toHaveLength(1);
    expect(savedConfigs.get(guilds[0].id)?.autoMod.forbiddenWords).toEqual(["nord"]);
    expect(savedConfigs.get(guilds[0].id)?.antiRaid.enabled).toBe(true);
    await expect(page.getByTestId("protection-save-bar")).toHaveCount(0);
  });

  test("suspicious-behaviour rules follow the module's reaction until they pick their own", async ({ page }) => {
    await page.goto("/moderare/comportament-suspect");
    await chooseFirstGuild(page);
    await page.getByTestId("actions-suspect-module").getByRole("checkbox", { name: "Kick" }).click();
    await page.getByRole("switch", { name: "Schimbări nickname" }).click();
    await expect(page.getByTestId("rule-suspect-nicknameChanges")).toContainText("Ca modulul: Kick");

    await page.getByTestId("rule-suspect-nicknameChanges-open").click();
    await page.getByTestId("actions-Schimbări nickname").getByRole("checkbox", { name: "Avertisment" }).click();
    await expect(page.getByTestId("actions-Schimbări nickname-summary")).toContainText("Avertisment");
    await expect(page.getByTestId("actions-Schimbări nickname-summary")).not.toContainText("Ca modulul");

    // Joins and leaves have no author to punish: that rule can only alert the staff.
    await page.getByTestId("rule-suspect-joinLeaveFlood-open").click();
    const joinLeave = page.getByTestId("actions-Flux intrări / ieșiri");
    await expect(joinLeave.getByRole("checkbox")).toHaveCount(1);
    await expect(joinLeave.getByRole("checkbox", { name: "Anunță staff-ul" })).toBeVisible();

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config")
      && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.suspiciousBehavior).toMatchObject({
      action: "kick",
      nicknameChanges: { enabled: true, action: "warn" },
    });
  });

  test("failed Discord log activation shows failure and does not claim a live log", async ({ page }) => {
    await page.route("**/api/moderation/guilds/111111111/config", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 503, json: { error: "Botul nu poate crea canalele de jurnal." } });
    });
    await page.goto("/moderare/jurnale/activitate");
    await chooseFirstGuild(page);
    await page.getByRole("switch", { name: "Activează jurnalele de activitate" }).click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).status()).toBe(503);
    await expect(page.getByTestId("logs-save-bar")).toBeVisible();
    // The attempted activation is still an unsaved draft; only the persisted
    // fixture stays off after the server rejects the request.
    await expect(page.getByRole("switch", { name: "Activează jurnalele de activitate" })).toBeChecked();
    await expect(page.getByTestId("nav-logs-activity").getByRole("img", { name: "are modificări nesalvate" })).toBeVisible();
    expect(savedConfigs.get(guilds[0].id)?.activityLog.enabled).toBe(false);
  });

  test("case retention and staff rights are saved, with a warning before older cases are deleted", async ({ page }) => {
    await page.goto("/moderare/jurnale");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cazurile de moderare" })).toBeVisible();
    await expect(page.getByTestId("quick-cases")).toHaveAttribute("href", "/moderare/cazuri");
    await page.getByTestId("cases-retention-90").click();
    await expect(page.getByTestId("cases-retention-warning")).toContainText("mai vechi de 90 de zile se șterg definitiv");
    await page.getByRole("switch", { name: "Staff-ul poate închide cazuri" }).click();
    await page.getByRole("switch", { name: "Staff-ul poate exporta cazurile (CSV)" }).click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.cases).toEqual({
      enabled: false, allowStaffClose: false, allowStaffNotes: true, allowStaffExport: true, retentionDays: 90,
    });
    await expect(page.getByTestId("cases-retention-warning")).toHaveCount(0);
  });

  test("the audit level and channel are saved and every module shows where it writes", async ({ page }) => {
    await page.goto("/moderare/jurnale/audit");
    await chooseFirstGuild(page);
    await page.getByRole("switch", { name: "Activează auditul" }).click();
    await page.getByTestId("audit-detail-level").getByRole("radio", { name: "Detaliat" }).click();
    await page.getByRole("combobox", { name: "Canal pentru Canal de audit" }).selectOption("444444444");
    const destinations = page.getByTestId("module-log-destinations");
    await expect(destinations).toContainText("canalul de audit");
    await expect(destinations).not.toContainText("nicăieri");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/moderation/guilds/111111111/config") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    expect((await saveResponse).ok()).toBe(true);
    expect(savedConfigs.get(guilds[0].id)?.audit).toEqual({ enabled: true, detailLevel: "verbose", channelId: "444444444" });
    await page.getByRole("switch", { name: "Activează auditul" }).click();
    await expect(destinations).toContainText("nicăieri");
  });

  test("the older address of case and audit settings opens the new page", async ({ page }) => {
    await page.goto("/moderare/config/cazuri-audit");
    await chooseFirstGuild(page);
    await expect(page).toHaveURL("/moderare/jurnale/cazuri");
    await expect(page.getByRole("heading", { name: "Cazurile de moderare" })).toBeVisible();
  });

  test("spam window edit replaces conflicting aliases with the engine's preferred key", async ({ page }) => {
    const config = fullConfig();
    config.antiSpam.message.thresholds = { windowMs: 5, window: 9, limit: 3 };
    savedConfigs.set(guilds[0].id, config);
    await page.goto("/moderare/anti-spam");
    await chooseFirstGuild(page);
    await page.getByTestId("rule-antispam-message-open").click();
    await page.getByTestId("rule-antispam-message").getByLabel("Fereastră (secunde)").fill("12");
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    expect(savedConfigs.get(guilds[0].id)?.antiSpam.message.thresholds).toEqual({ windowMs: 12, limit: 3 });
  });

  test("switching guilds discards the previous guild's unsaved category draft", async ({ page }) => {
    await page.goto("/moderare/automod");
    await chooseFirstGuild(page);
    const words = page.getByLabel("Cuvinte interzise", { exact: true });
    const chips = page.getByTestId("rule-automod-wordFilter").locator(".pn-chip");
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await words.fill("nesalvat nord");
    await words.press("Enter");
    await expect(chips).toHaveCount(1);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[1].name }).click();
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await expect(chips).toHaveCount(0);
    await words.fill("salvat sud");
    await words.press("Enter");
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("button", { name: "Salvează" })).toHaveCount(0);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: guilds[0].name }).click();
    await page.getByTestId("rule-automod-wordFilter-open").click();
    await expect(chips).toHaveCount(0);
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

  const enableCommands = () => {
    const config = fullConfig();
    config.manualTools.enabled = true;
    savedConfigs.set(guilds[0].id, config);
  };

  test("submits manual commands to the real action endpoint and displays its result", async ({ page }) => {
    enableCommands();
    await page.goto("/moderare/comenzi");
    await chooseFirstGuild(page);
    await expect(page.getByTestId("commands-summary")).toContainText("11/11");
    await page.getByTestId("command-review").click();
    await expect(page.getByTestId("command-problem")).toContainText("Scrie membrul");
    expect(actionBodies).toEqual([]);
    await page.getByTestId("command-member").fill("<@555555555>");
    await page.getByTestId("command-review").click();
    await expect(page.getByTestId("command-confirm")).toContainText("primește un avertisment");
    await page.getByTestId("command-send").click();
    await expect(page.getByTestId("command-result")).toContainText("Warn applied");
    expect(actionBodies).toEqual([{ type: "warn", targetId: "555555555" }]);
  });

  test("says the bot refuses every command while staff commands are switched off", async ({ page }) => {
    await page.goto("/moderare/comenzi");
    await chooseFirstGuild(page);
    await expect(page.getByTestId("commands-off")).toContainText("Comenzile staff-ului sunt oprite");
    await expect(page.getByTestId("commands-summary")).toContainText("0/11");
    await expect(page.getByTestId("command-blocked")).toBeVisible();
  });

  test("previews eligible members and requires confirmation before granting a role in bulk", async ({ page }) => {
    enableCommands();
    await page.goto("/moderare/comenzi");
    await chooseFirstGuild(page);
    await page.getByTestId("pick-command-role").click();
    await expect(page).toHaveURL(/comanda=role/);
    await page.getByTestId("command-role-scope").getByRole("radio", { name: "Tuturor membrilor" }).click();
    await expect(page.getByTestId("command-member")).toHaveCount(0);
    await page.getByTestId("command-role").selectOption("333333333");
    await page.getByTestId("command-review").click();
    await expect(page.getByTestId("command-confirm")).toContainText("Toți membrii care pot primi rolul @Moderatori îl primesc.");
    await expect(page.getByTestId("command-preview").locator("li").first()).toContainText("5");
    await expect(page.getByTestId("command-preview").locator("li").first()).toContainText("primesc rolul");
    expect(rolePreviewBodies).toEqual([{ roleId: "333333333" }]);
    expect(actionBodies).toEqual([]);
    await page.getByRole("button", { name: "Dă rolul la 5 membri" }).click();
    await expect(page.getByTestId("command-result")).toContainText("Warn applied");
    expect(actionBodies).toEqual([{
      type: "role",
      allMembers: true,
      previewToken: "bulk-role-preview-token-123",
      roleId: "333333333",
    }]);
  });

  for (const command of [
    { type: "purge", amount: 25, sentence: "Se șterg ultimele 25 de mesaje" },
    { type: "slowmode", amount: 0, sentence: "nu mai are slowmode" },
  ]) {
    test(`executes ${command.type} with the chosen channel and exact amount`, async ({ page }) => {
      enableCommands();
      await page.goto(`/moderare/comenzi?comanda=${command.type}`);
      await chooseFirstGuild(page);
      await page.getByTestId("command-channel-id").fill("444444444");
      await page.getByTestId(`command-${command.type}`).fill(String(command.amount));
      await page.getByTestId("command-review").click();
      await expect(page.getByTestId("command-confirm")).toContainText(command.sentence);
      await page.getByTestId("command-send").click();
      await expect(page.getByTestId("command-result")).toBeVisible();
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
    await page.goto("/moderare?auth_error=state_mismatch");
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

  test("shows the operator gate with the server door and the bot panel door", async ({ page }) => {
    await page.goto("/moderare");
    await expect(page).toHaveTitle("Autentificare operator | Regatul Cenușii");
    await expect(page.getByTestId("operator-gate")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Autentificare Operator" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Regatul Cenușii" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Panoul botului" })).toBeVisible();
    await expect(page.getByTestId("link-gate-brand")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("link-server-guide-login")).toHaveAttribute("href", "/server");
    await expect(page.getByRole("link", { name: "Intră în regat" })).toBeVisible();
    await expect(page.getByTestId("button-open-panel")).toHaveAttribute("href", "/api/moderation/oauth/discord");
    await expect(page.getByTestId("discord-login-button")).toHaveAttribute("href", "/api/moderation/oauth/discord");
    await expect(page.getByTestId("link-invite-bot")).toHaveCount(0);
  });

  test("starts the Discord login from the bot panel door", async ({ page }) => {
    await page.route("**/api/moderation/oauth/discord", async (route) => {
      await route.fulfill({ status: 204 });
    });
    await page.goto("/moderare");
    const oauthRequest = page.waitForRequest("**/api/moderation/oauth/discord");
    await page.getByTestId("button-open-panel").click();
    expect((await oauthRequest).url()).toContain("/api/moderation/oauth/discord");
  });

  test("leads the server door to the community page", async ({ page }) => {
    await page.goto("/moderare");
    await page.getByTestId("link-server-guide-login").click();
    await expect(page).toHaveURL("/server");
    await expect(page.getByTestId("operator-gate")).toHaveCount(0);
    await expect(page.locator("h1")).toContainText("Un loc pentru oameni și povești.", { useInnerText: true });
  });

  test("the brand leads back to the start page", async ({ page }) => {
    await page.goto("/moderare?auth_error=cancelled");
    await page.getByTestId("link-gate-brand").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("operator-gate")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keeps the bot panel door disabled while Discord sign-in is unavailable", async ({ page }) => {
    await page.unroute("**/api/moderation/auth-config");
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({ json: { discordOAuthConfigured: false, authorizationUrl: "/api/moderation/oauth/discord" } });
    });
    let oauthRequests = 0;
    await page.route("**/api/moderation/oauth/discord", async (route) => {
      oauthRequests += 1;
      await route.fulfill({ status: 204 });
    });
    await page.goto("/moderare");
    const panelDoor = page.getByTestId("button-open-panel");
    await expect(panelDoor).toBeDisabled();
    await expect(panelDoor).not.toHaveAttribute("href", /.+/);
    await panelDoor.click({ force: true });
    await expect(page).toHaveURL(/\/moderare$/);
    expect(oauthRequests).toBe(0);
  });

  test("offers a retry when the sign-in configuration cannot be loaded", async ({ page }) => {
    let healthy = false;
    await page.unroute("**/api/moderation/auth-config");
    await page.route("**/api/moderation/auth-config", async (route) => {
      await route.fulfill({
        json: healthy ? { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } : {},
      });
    });
    await page.goto("/moderare");
    await expect(page.getByRole("alert")).toContainText("Configurația autentificării Discord este invalidă");
    await expect(page.getByTestId("button-open-panel")).toBeDisabled();
    await expect(page.getByTestId("discord-login-button")).toHaveCount(0);
    healthy = true;
    await page.getByTestId("button-retry-auth-config").click();
    await expect(page.getByTestId("discord-login-button")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByTestId("button-open-panel")).toBeEnabled();
  });
});

test.describe("verification page", () => {
  const verifiedConfig = (extraRoleIds: string[] = []) => {
    const config = verificationBotControlConfig(true, "panel-north");
    config.verification.channelId = "777777777";
    config.verification.roleId = "444444444";
    return { ...config, verification: { ...config.verification, extraRoleIds } };
  };
  const member = (id: string, displayName: string, roleIds: string[]) => ({
    id, displayName, username: displayName.toLowerCase().replace(/\s+/g, ""), avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
    joinedAt: "2026-09-01T10:00:00.000Z", verified: roleIds.includes("444444444"), roleIds,
  });
  async function openVerification(page: import("@playwright/test").Page, path = "/moderare/verificare") {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
    await expect(page.getByTestId("verification-page")).toBeVisible();
  }

  test("is its own page with settings, messages and members", async ({ page }) => {
    await installPartialBotControlFixture(page, new Map([[guilds[0].id, verifiedConfig()], [guilds[1].id, verificationBotControlConfig(false, "")]]));
    await openVerification(page);
    await expect(page.getByRole("heading", { name: "Verificare", exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-verification-settings")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("nav-verification-messages").click();
    await expect(page).toHaveURL(/\/moderare\/verificare\/mesaje$/);
    await expect(page.getByTestId("verification-discord-preview")).toContainText("Verifică-ți contul");
    await page.getByTestId("nav-verification-members").click();
    await expect(page).toHaveURL(/\/moderare\/verificare\/membri$/);
    await expect(page.getByTestId("members-list-card")).toBeVisible();
  });

  test("gives extra roles such as a category role and shows them on the member's profile", async ({ page }) => {
    const configs = new Map([[guilds[0].id, verifiedConfig()], [guilds[1].id, verificationBotControlConfig(false, "")]]);
    const putBodies = await installPartialBotControlFixture(page, configs);
    await openVerification(page);

    const extraRoles = page.getByTestId("verification-extra-roles");
    // Staff roles are never offered; a role above the bot is offered with a note.
    await expect(extraRoles.getByRole("checkbox", { name: "@Moderator" })).toHaveCount(0);
    await expect(extraRoles.getByRole("checkbox", { name: "@Fondator" })).toBeVisible();
    await extraRoles.getByRole("checkbox", { name: "@━━ MEMBRI ━━" }).click();
    const preview = page.getByTestId("verification-profile-preview");
    await expect(preview).toContainText("MEMBRI");
    await expect(preview).toContainText("Verified");
    await expect(page.getByTestId("nav-verification-settings").locator(".pn-nav-dirty")).toBeVisible();

    await page.getByTestId("button-save-verification").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0].verification).toMatchObject({ roleId: "444444444", extraRoleIds: ["555555555"] });
    await expect(page.getByTestId("verification-save-bar")).toHaveCount(0);
  });

  test("does not save a switched-on verification without its channel", async ({ page }) => {
    const config = verificationBotControlConfig(false, "");
    config.verification.roleId = "444444444";
    const putBodies = await installPartialBotControlFixture(page, new Map([[guilds[0].id, config], [guilds[1].id, verificationBotControlConfig(false, "")]]));
    await openVerification(page);
    await page.getByRole("switch", { name: "Activează verificarea" }).click();
    await page.getByTestId("button-save-verification").click();
    await expect(page.getByTestId("verification-save-bar")).toBeVisible();
    expect(putBodies.size).toBe(0);
    await page.getByRole("combobox", { name: "Canalul panoului" }).selectOption("777777777");
    await page.getByTestId("button-save-verification").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.[0]?.verification?.channelId).toBe("777777777");
  });

  test("lists the members live and verifies the selected ones with their missing roles", async ({ page }) => {
    await installPartialBotControlFixture(page, new Map([[guilds[0].id, verifiedConfig(["555555555"])], [guilds[1].id, verificationBotControlConfig(false, "")]]));
    let members = [
      member("100000000000000001", "Ana", []),
      member("100000000000000002", "Bogdan", ["444444444"]),
      member("100000000000000003", "Cezar", ["444444444", "555555555"]),
    ];
    let listRequests = 0;
    await page.route("**/api/moderation/guilds/*/verification/members", async (route) => {
      listRequests += 1;
      const verifiedTotal = members.filter((item) => item.verified).length;
      await route.fulfill({
        json: { guildId: guilds[0].id, roleId: "444444444", roleName: "Verified", total: members.length, verifiedTotal, unverifiedTotal: members.length - verifiedTotal, members },
      });
    });
    const verifyBodies: Array<{ userIds: string[]; roleIds: string[] }> = [];
    let csrf: string | undefined;
    await page.route("**/api/moderation/guilds/*/verification/members/verify", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      verifyBodies.push(body);
      csrf = route.request().headers()["x-csrf-token"];
      members = members.map((item) => body.userIds.includes(item.id)
        ? { ...item, verified: true, roleIds: ["444444444", ...body.roleIds] }
        : item);
      await route.fulfill({
        json: {
          roleId: "444444444",
          results: body.userIds.map((userId: string) => ({ userId, displayName: null, result: userId === "100000000000000001" ? "verified" : "updated", added: [] })),
          unavailableRoles: [],
          verified: 1, updated: body.userIds.length - 1, unchanged: 0, failed: 0,
        },
      });
    });

    await openVerification(page, "/moderare/verificare/membri");
    await expect(page.getByTestId("member-state-100000000000000001")).toHaveText("Neverificat");
    await expect(page.getByTestId("member-row-100000000000000002")).toContainText("lipsește @━━ MEMBRI ━━");
    await page.getByRole("radio", { name: "Le lipsesc roluri · 1" }).click();
    await expect(page.getByTestId("members-list").getByRole("listitem")).toHaveCount(1);
    await page.getByRole("radio", { name: "Toți · 3" }).click();

    await page.getByText("Bifează toți cei 3 din listă").click();
    await expect(page.getByTestId("button-verify-selected")).toHaveText(/Verifică și dă rolurile \(3 membri\)/);
    await page.getByRole("checkbox", { name: "Bifează Cezar" }).uncheck();
    await page.getByTestId("button-verify-selected").click();

    await expect.poll(() => verifyBodies.length).toBe(1);
    expect(verifyBodies[0]).toEqual({ userIds: ["100000000000000001", "100000000000000002"], roleIds: ["555555555"] });
    expect(csrf).toBe("test-csrf");
    await expect(page.getByTestId("members-outcome")).toContainText("1 membru verificat acum · 1 membru a primit rolurile lipsă");
    await expect(page.getByTestId("member-state-100000000000000001")).toHaveText("Verificat");
    await expect(page.getByTestId("member-row-100000000000000002")).not.toContainText("lipsește");
    expect(listRequests).toBeGreaterThan(1);
  });

  test("publishes only the verification config without saving unrelated bot-control settings", async ({ page }) => {
    const northConfig = verificationBotControlConfig(true, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs);
    const publishBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/moderation/guilds/*/bot-control/verification-panel", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      publishBodies.push(body);
      await route.fulfill({ json: { verification: { ...body, panelMessageId: "panel-north" } } });
    });

    await openVerification(page);
    const publishRequest = page.waitForRequest((request) =>
      request.url().endsWith("/verification-panel") && request.method() === "POST");
    await page.getByRole("button", { name: "Publică panoul" }).click();
    const body = JSON.parse((await publishRequest).postData() || "{}");

    expect(Object.keys(body).sort()).toEqual([
      "alreadyVerifiedMessage", "buttonEmoji", "buttonLabel", "channelId", "enabled", "imageUrl", "message",
      "panelMessageId", "roleId", "successMessage", "thumbnailUrl", "title",
    ]);
    expect(body).toMatchObject({ channelId: "777777777", roleId: "444444444", enabled: true });
    expect(publishBodies).toHaveLength(1);
    expect(putBodies.size).toBe(0);
    await expect(page.getByRole("button", { name: "Actualizează panoul" })).toBeVisible();
    await expect(page.getByTestId("verification-save-bar")).toHaveCount(0);
  });

  test("reuses the recovered panel ID after a partial result from the standalone publish action", async ({ page }) => {
    const northConfig = verificationBotControlConfig(true, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs);
    const publishBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/moderation/guilds/*/bot-control/verification-panel", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      publishBodies.push(body);
      if (publishBodies.length === 1) {
        await route.fulfill({
          status: 207,
          json: {
            partialApply: true,
            verificationPanelPublished: true,
            verification: { ...body, panelMessageId: "panel-north" },
            message: "Persistarea setărilor de verificare a eșuat.",
          },
        });
        return;
      }
      await route.fulfill({ json: { verification: { ...body, panelMessageId: "panel-north" } } });
    });

    await openVerification(page);
    await page.getByRole("button", { name: "Publică panoul" }).click();
    const recovery = page.getByTestId("verification-recovery");
    await expect(recovery).toContainText("panel-north");
    await expect(recovery).toContainText("Panoul a fost publicat, dar setările s-au salvat doar în parte.");

    const retryRequest = page.waitForRequest((request) =>
      request.url().endsWith("/verification-panel") && request.method() === "POST");
    await page.getByRole("button", { name: "Publică panoul" }).click();
    const retryBody = JSON.parse((await retryRequest).postData() || "{}");
    expect(retryBody.panelMessageId).toBe("panel-north");
    expect(publishBodies).toHaveLength(2);
    expect(putBodies.size).toBe(0);
    await expect(recovery).toHaveCount(0);
  });

  test("retains the published panel ID after a reload and sends it on retry", async ({ page }) => {
    const northConfig = verificationBotControlConfig(false, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(true, "panel-south", false)],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "panel-north" },
      message: "Persistarea configurației a eșuat.",
    }));

    await openVerification(page);
    const enabled = page.getByRole("switch", { name: "Activează verificarea" });
    await expect(enabled).toHaveAttribute("aria-checked", "false");
    await enabled.click();
    await page.getByTestId("button-save-verification").click();

    const recovery = page.getByTestId("verification-recovery");
    await expect(recovery).toContainText("Panoul a fost publicat, dar setările s-au salvat doar în parte.");
    await expect(recovery).toContainText("panel-north");

    await page.reload();
    await expect(page.getByTestId("verification-recovery")).toContainText("panel-north");
    await expect(page.getByTestId("verification-save-bar")).toBeVisible();
    await page.getByRole("switch", { name: "Activează verificarea" }).click();
    const retry = page.waitForRequest((request) =>
      request.url().includes(`/guilds/${guilds[0].id}/bot-control`) && request.method() === "PUT");
    await page.getByTestId("button-save-verification").click();
    const retryBody = JSON.parse((await retry).postData() || "{}");
    expect(retryBody.verification.panelMessageId).toBe("panel-north");
    await expect(page.getByTestId("verification-recovery")).toHaveCount(0);
    expect(putBodies.get(guilds[0].id)?.[1].verification.panelMessageId).toBe("panel-north");
  });

  test("blocks retry when a published panel ID is missing until manual reconciliation", async ({ page }) => {
    const northConfig = verificationBotControlConfig(false, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    const putBodies = await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "" },
      message: "Discord a publicat panoul, dar nu a returnat ID-ul.",
    }));

    await openVerification(page);
    await page.getByRole("switch", { name: "Activează verificarea" }).click();
    await page.getByTestId("button-save-verification").click();
    await expect(page.getByTestId("verification-recovery")).toContainText("ID-ul panoului nu s-a întors.");
    const saveButton = page.getByTestId("button-save-verification");
    await expect(saveButton).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publică panoul" })).toBeDisabled();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Am verificat panoul din Discord" }).click();
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
    const northConfig = verificationBotControlConfig(false, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { ...body.verification, panelMessageId: "panel-north" },
      message: "Partial response from Discord.",
    }));

    await openVerification(page);
    await page.getByRole("switch", { name: "Activează verificarea" }).click();
    await page.getByTestId("button-save-verification").click();

    const recoveryAlert = page.getByTestId("verification-recovery");
    await expect(recoveryAlert).toContainText("panel-north");
    await expect(recoveryAlert).toContainText("Pagina nu poate păstra ID-ul după reîncărcare.");
    await expect(page.getByTestId("button-save-verification")).toBeDisabled();
  });

  test("does not claim a panel was published for a generic partial apply", async ({ page }) => {
    const northConfig = verificationBotControlConfig(false, "");
    northConfig.verification.channelId = "777777777";
    northConfig.verification.roleId = "444444444";
    const configs = new Map([
      [guilds[0].id, northConfig],
      [guilds[1].id, verificationBotControlConfig(false, "")],
    ]);
    await installPartialBotControlFixture(page, configs, (body) => ({
      partialApply: true,
      verificationPanelPublished: false,
      verification: body.verification,
      message: "Salvarea configurației nu a fost efectuată.",
    }));

    await openVerification(page);
    await page.getByRole("switch", { name: "Activează verificarea" }).click();
    await page.getByTestId("button-save-verification").click();
    const partialAlert = page.getByTestId("verification-recovery");
    await expect(partialAlert).toContainText("Serverul a aplicat salvarea doar în parte; efectele din Discord nu sunt confirmate.");
    await expect(partialAlert).not.toContainText("Panoul a fost publicat");
    await expect(partialAlert).not.toContainText("Salvarea configurației nu a fost efectuată.");
  });
});

test.describe("tickets page", () => {
  const question = (key: string, label: string, required = true) => ({
    key, label, description: `Despre ${label}`, placeholder: "Răspuns", multiline: false, required, imageUrl: "", thumbnailUrl: "",
  });
  const flow = (title: string, keys: Array<[string, string]>, completionAction = "notify_staff") => ({
    mode: "custom", title, startButtonLabel: "Începe", panelDescription: `${title}: descriere`, requirementsText: "Citește regulile.",
    completionMessage: "Formular trimis.", staffNotificationMessage: "Un formular nou.", completionAction,
    questions: keys.map(([key, label]) => question(key, label)),
    panelImageUrl: "", panelThumbnailUrl: "", completionImageUrl: "", completionThumbnailUrl: "", staffNotificationImageUrl: "", staffNotificationThumbnailUrl: "",
  });
  const ticketsConfig = () => ({
    ...verificationBotControlConfig(false, ""),
    tickets: {
      categories: { staff: "", partnership: "", help_report: "", appeal: "" },
      staffReviewRoleId: "444444444", alliancePublicChannelId: "", allianceOwnerGuildId: "",
      allianceAnnouncementTemplate: "{server_name}", allianceAnnouncementMode: "text", allianceAnnouncementImageUrl: "",
      allianceAnnouncementThumbnailUrl: "", allianceAnnouncementImageMode: "none",
      incompleteTimeoutMinutes: 60, firstWarningMinutes: 20, secondWarningMinutes: 50,
      flows: {
        staff: flow("Aplicație", [["name", "Nume"], ["age", "Vârstă"]]),
        partnership: flow("Parteneriat", [["server_name", "Server"], ["invite", "Link"]]),
        help_report: flow("Ajutor", [["type", "Tip"]], "lock"),
        appeal: flow("Contestație", [["case_id", "ID-ul cazului"], ["reason", "Motiv"]]),
      },
    },
  });
  async function openTickets(page: import("@playwright/test").Page, path = "/moderare/tichete") {
    const putBodies = await installPartialBotControlFixture(page, new Map([
      [guilds[0].id, ticketsConfig() as any], [guilds[1].id, ticketsConfig() as any],
    ]));
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
    await expect(page.getByTestId("tickets-page")).toBeVisible();
    return putBodies;
  }

  test("is its own page and a flow works once it has a category", async ({ page }) => {
    const putBodies = await openTickets(page);
    await expect(page.getByRole("heading", { name: "Aplicații de staff", exact: true })).toBeVisible();
    await expect(page.getByTestId("tickets-staff-state")).toHaveText("Oprit · fără categorie");
    await page.getByRole("combobox", { name: "Categoria pentru Aplicații staff" }).selectOption("333333333");
    await expect(page.getByTestId("tickets-staff-state")).toHaveText("Pornit");
    await expect(page.getByTestId("nav-tickets-staff").locator(".pn-nav-dirty")).toBeVisible();
    await page.getByTestId("button-save-tickets").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0].tickets.categories.staff).toBe("333333333");
    await expect(page.getByTestId("tickets-save-bar")).toHaveCount(0);
  });

  test("edits the questions and does not save two answers with the same key", async ({ page }) => {
    const putBodies = await openTickets(page);
    await page.getByTestId("question-staff-1-open").click();
    const keyField = page.getByTestId("question-staff-1").getByLabel("Cheia", { exact: true });
    await keyField.fill("name");
    await expect(page.getByTestId("tickets-staff-questions")).toContainText("Aceeași cheie apare de mai multe ori: name");
    await page.getByTestId("button-save-tickets").click();
    expect(putBodies.size).toBe(0);
    await keyField.fill("Vârsta Mea");
    await expect(keyField).toHaveValue("varsta_mea");
    await page.getByTestId("tickets-staff-add-question").click();
    await page.getByRole("button", { name: "Mută întrebarea 3 mai sus" }).click();
    await page.getByTestId("button-save-tickets").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    const staff = putBodies.get(guilds[0].id)?.[0].tickets.flows.staff;
    expect(staff.questions.map((item: { key: string }) => item.key)).toEqual(["name", "intrebare_3", "varsta_mea"]);
    expect(staff.mode).toBe("custom");
  });

  test("keeps the case question first in appeals", async ({ page }) => {
    await openTickets(page, "/moderare/tichete/contestatii");
    await expect(page.getByRole("button", { name: "Șterge întrebarea 1" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Mută întrebarea 2 mai sus" })).toBeDisabled();
    await expect(page.getByTestId("question-appeal-0")).toContainText("ID-ul cazului contestat · mereu prima");
  });

  test("turns the staff mention off and the publication of alliances on", async ({ page }) => {
    const putBodies = await openTickets(page, "/moderare/tichete/parteneriate");
    await page.getByTestId("tickets-partnership-notify").click();
    await page.getByTestId("tickets-alliances-switch").click();
    await expect(page.getByTestId("tickets-alliances")).toContainText("Alege canalul alianțelor");
    await page.getByRole("combobox", { name: "Canalul alianțelor" }).selectOption("777777777");
    await page.getByTestId("button-save-tickets").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    const tickets = putBodies.get(guilds[0].id)?.[0].tickets;
    expect(tickets.flows.partnership.completionAction).toBe("lock");
    expect(tickets.allianceOwnerGuildId).toBe(guilds[0].id);
    expect(tickets.alliancePublicChannelId).toBe("777777777");
  });

  test("wants the warnings before the deletion of an unfinished ticket", async ({ page }) => {
    const putBodies = await openTickets(page, "/moderare/tichete/setari");
    const first = page.getByTestId("tickets-firstWarningMinutes");
    await first.fill("55");
    await expect(page.getByTestId("tickets-deadlines")).toContainText("Primul avertisment trebuie să vină înaintea celui de-al doilea.");
    await page.getByTestId("button-save-tickets").click();
    expect(putBodies.size).toBe(0);
    await first.fill("15");
    await page.getByTestId("button-save-tickets").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.[0]?.tickets.firstWarningMinutes).toBe(15);
  });

  test("lets you try the form without sending anything", async ({ page }) => {
    const putBodies = await openTickets(page);
    await page.getByTestId("tickets-staff-try-start").click();
    await page.getByTestId("tickets-staff-try-next").click();
    await expect(page.getByTestId("tickets-staff-try")).toContainText("Răspunsul e obligatoriu.");
    await page.getByTestId("tickets-staff-try-question").getByRole("textbox").fill("Ana");
    await page.getByTestId("tickets-staff-try-next").click();
    await page.getByTestId("tickets-staff-try-question").getByRole("textbox").fill("21");
    await page.getByTestId("tickets-staff-try-next").click();
    await expect(page.getByTestId("tickets-staff-try-done")).toContainText("Ana");
    await expect(page.getByTestId("tickets-staff-try-done")).toContainText("@staff Un formular nou.");
    expect(putBodies.size).toBe(0);
  });
});

test.describe("oracle page", () => {
  const oracleConfig = (oracle?: Record<string, unknown>) => ({
    ...verificationBotControlConfig(false, ""),
    ...(oracle ? { oracle } : {}),
    gameplayConfig: {
      paused: false,
      messages: {
        gamePaused: "Jocul e oprit.", oraclePaused: "Oracolul e oprit.", gamePausedImageUrl: "", gamePausedThumbnailUrl: "",
        oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "",
      },
      memberMessages: { welcomeEnabled: false, leaveEnabled: false, channelId: "", style: "medieval", customStyle: "" },
    },
  });
  const savedOracle = () => ({
    enabled: true,
    chat: { channelIds: [], replyToReplies: true, tone: "implicit", length: "mediu", cooldownSeconds: 12 },
    prophecy: { commandEnabled: true, dailyLimit: 10, daily: { enabled: false, channelId: "", hour: 9, timeZone: "Europe/Bucharest" } },
  });
  async function openOracle(page: import("@playwright/test").Page, path = "/moderare/oracol", oracle: Record<string, unknown> | undefined = savedOracle()) {
    const putBodies = await installPartialBotControlFixture(page, new Map([
      [guilds[0].id, oracleConfig(oracle) as any], [guilds[1].id, oracleConfig(oracle) as any],
    ]));
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
    await expect(page.getByTestId("oracle-page")).toBeVisible();
    return putBodies;
  }

  test("is its own page; the switch stops the Oracle and the paused reply is edited here", async ({ page }) => {
    const putBodies = await openOracle(page);
    await expect(page.getByRole("heading", { name: "Pornirea Oracolului", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Modulele Oracolului" }).getByRole("link")).toHaveCount(4);
    await page.getByTestId("oracle-enabled-switch").click();
    await expect(page.getByTestId("oracle-disabled")).toBeVisible();
    await expect(page.getByTestId("oracle-summary")).toContainText("Oprit");
    await page.getByTestId("oracle-paused-text").getByRole("textbox").fill("Oracolul doarme.");
    await expect(page.getByTestId("oracle-paused-preview")).toContainText("Oracolul doarme.");
    await page.getByTestId("button-save-oracle").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    const body = putBodies.get(guilds[0].id)?.[0];
    expect(body.oracle.enabled).toBe(false);
    expect(body.gameplayConfig.messages.oraclePaused).toBe("Oracolul doarme.");
  });

  test("limits the chat to chosen places and asks for at least one", async ({ page }) => {
    const putBodies = await openOracle(page, "/moderare/oracol/conversatie");
    await page.getByTestId("oracle-where-mode").getByRole("radio", { name: "Doar unde aleg" }).click();
    await expect(page.getByTestId("oracle-where-empty")).toBeVisible();
    await page.getByTestId("oracle-channels").getByRole("checkbox", { name: "#Tichete staff" }).click();
    await expect(page.getByTestId("oracle-where-summary")).toContainText("categoria Tichete staff");
    await page.getByTestId("oracle-reply-switch").click();
    await page.getByTestId("oracle-cooldown").fill("30");
    await page.getByTestId("button-save-oracle").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0].oracle.chat).toEqual({
      channelIds: ["333333333"], replyToReplies: false, tone: "implicit", length: "mediu", cooldownSeconds: 30,
    });
  });

  test("shows an example for the chosen tone and length", async ({ page }) => {
    const putBodies = await openOracle(page, "/moderare/oracol/ton");
    const sample = page.getByTestId("oracle-style-sample");
    const before = await sample.innerText();
    await page.getByTestId("oracle-tone-sobru").click();
    await page.getByTestId("oracle-length-seg").getByRole("radio", { name: "Scurt" }).click();
    await expect(sample).not.toHaveText(before);
    await expect(sample).toHaveText("Deschide un tichet „Aplicații staff” și completează formularul.");
    await page.getByTestId("button-save-oracle").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0].oracle.chat).toMatchObject({ tone: "sobru", length: "scurt" });
  });

  test("needs a channel for the prophecy of the day and saves the hour and time zone", async ({ page }) => {
    const putBodies = await openOracle(page, "/moderare/oracol/profetii");
    await page.getByTestId("oracle-daily-limit").fill("4");
    await page.getByTestId("oracle-daily-switch").click();
    await page.getByTestId("button-save-oracle").click();
    expect(putBodies.size).toBe(0);
    await page.getByRole("combobox", { name: "Canalul profeției zilei" }).selectOption("777777777");
    await page.getByTestId("oracle-daily-hour").getByRole("radio", { name: "21:00" }).click();
    await page.getByTestId("oracle-daily-timezone").selectOption("UTC");
    await expect(page.getByTestId("oracle-daily-next")).toContainText("la 21:00, ora UTC");
    await page.getByTestId("button-save-oracle").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0].oracle.prophecy).toEqual({
      commandEnabled: true, dailyLimit: 4, daily: { enabled: true, channelId: "777777777", hour: 21, timeZone: "UTC" },
    });
  });

  test("a server without saved settings opens with the defaults, and other pages leave them alone", async ({ page }) => {
    const putBodies = await openOracle(page, "/moderare/oracol/profetii", undefined);
    await expect(page.getByTestId("oracle-command-switch")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".pn-nav-dirty")).toHaveCount(0);
    await expect(page.getByTestId("oracle-save-bar")).toHaveCount(0);
    // Same app, another page: the draft of the bot's settings is loaded again there.
    await page.evaluate(() => {
      window.history.pushState(null, "", "/moderare/verificare/mesaje");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByTestId("verification-page")).toBeVisible();
    await page.getByTestId("verification-text-title").getByRole("textbox").fill("Bun venit");
    await page.getByTestId("button-save-verification").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)?.[0]).not.toHaveProperty("oracle");
  });
});

test.describe("bot settings page", () => {
  const moderationConfig = (withDm = true) => ({
    protection: { enabled: true },
    permissions: { staffRoleIds: [] as string[], allowManageGuild: true, allowAdminsSettings: false },
    embeds: { enabled: false, color: "#5865F2", iconUrl: null, titleTemplate: "Moderation action", descriptionTemplate: "{action}: {reason}", style: "plain", animations: false, animationUrl: null },
    ...(withDm ? { sanctionDm: {
      enabled: false, actions: ["warn", "mute", "kick", "ban"], automatic: true, showReason: true, showModerator: false,
      appealText: "Dacă vrei să contești, deschide pe {guild} un tichet de contestație și scrie ID-ul cazului de mai sus.",
      removedAppealText: "Dacă vrei să contești, scrie-i unui administrator al serverului {guild} și dă-i ID-ul cazului de mai sus.", appealUrl: null,
    } } : {}),
  });
  const botConfig = () => ({
    ...verificationBotControlConfig(false, ""),
    gameplayConfig: {
      paused: false,
      messages: { gamePaused: "Jocul e oprit.", oraclePaused: "Oracolul e oprit.", gamePausedImageUrl: "", gamePausedThumbnailUrl: "", oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "" },
      memberMessages: { welcomeEnabled: false, leaveEnabled: false, channelId: "", style: "normal", customStyle: "" },
    },
  });
  async function openSettings(page: import("@playwright/test").Page, path = "/moderare/setari", withDm = true) {
    const botPuts = await installPartialBotControlFixture(page, new Map([
      [guilds[0].id, botConfig() as any], [guilds[1].id, botConfig() as any],
    ]));
    const configPuts: any[] = [];
    let saved: any = moderationConfig(withDm);
    let version = 1;
    await page.route("**/api/moderation/guilds/*/config", async (route) => {
      if (route.request().method() === "PUT") {
        const body = JSON.parse(route.request().postData() || "{}");
        configPuts.push(body);
        saved = body;
        version += 1;
      }
      await route.fulfill({ json: { config: saved, version }, headers: { ETag: `"${version}"` } });
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    return { botPuts, configPuts };
  }

  test("saves access, notifications and the private message to the moderation settings", async ({ page }) => {
    const { botPuts, configPuts } = await openSettings(page);
    await expect(page.getByRole("heading", { name: "Acces staff", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Modulele setărilor" }).getByRole("link")).toHaveCount(4);
    await page.getByTestId("settings-staff-roles-picker").getByRole("checkbox", { name: "@Moderator" }).click();
    await page.getByTestId("nav-settings-notices").click();
    await page.getByTestId("settings-embeds-switch").click();
    await page.getByRole("button", { name: "Jar" }).click();
    await page.getByTestId("settings-template-recommended").click();
    await expect(page.getByTestId("settings-notice-preview")).toContainText("🛡️ Timeout aplicat");
    await page.getByTestId("nav-settings-dm").click();
    await expect(page.getByTestId("settings-dm-off")).toBeVisible();
    await page.getByTestId("settings-dm-switch").click();
    await page.getByTestId("settings-dm-action-warn").click();
    await page.getByTestId("settings-dm-url").fill("https://apel.example.com");
    await page.getByTestId("settings-dm-preview-kick").click();
    await expect(page.getByTestId("settings-dm-preview")).toContainText("Ai fost scos de pe server");
    await expect(page.getByTestId("settings-dm-preview")).toContainText("administrator al serverului");
    await expect(page.getByTestId("settings-save-bar")).toContainText("Acces staff, Notificări, Mesaje în privat");
    await page.getByTestId("button-save-settings").click();
    await expect.poll(() => configPuts.length).toBe(1);
    expect(configPuts[0].permissions.staffRoleIds).toEqual(["666666666"]);
    expect(configPuts[0].embeds).toMatchObject({ enabled: true, color: "#FF6B3D", titleTemplate: "🛡️ {action}" });
    expect(configPuts[0].sanctionDm).toMatchObject({ enabled: true, actions: ["mute", "kick", "ban"], appealUrl: "https://apel.example.com" });
    expect(botPuts.size).toBe(0);
    await expect(page.getByTestId("settings-save-bar")).toHaveCount(0);
  });

  test("keeps the private message off on an older server and refuses it without a sanction", async ({ page }) => {
    const { configPuts } = await openSettings(page, "/moderare/setari/privat", false);
    await expect(page.getByTestId("settings-dm-off")).toBeVisible();
    await expect(page.locator(".pn-nav-dirty")).toHaveCount(0);
    await page.getByTestId("settings-dm-switch").click();
    for (const kind of ["warn", "mute", "kick", "ban"]) await page.getByTestId(`settings-dm-action-${kind}`).click();
    await expect(page.getByTestId("settings-dm-when")).toContainText("Alege cel puțin o sancțiune");
    await page.getByTestId("button-save-settings").click();
    expect(configPuts).toEqual([]);
  });

  test("saves the welcome messages to the bot settings and asks for their channel", async ({ page }) => {
    const { botPuts, configPuts } = await openSettings(page, "/moderare/setari/bun-venit");
    await page.getByTestId("settings-welcome-switch").click();
    await expect(page.getByTestId("settings-welcome-when")).toContainText("Alege canalul");
    await page.getByTestId("button-save-settings").click();
    expect(botPuts.size).toBe(0);
    await page.getByRole("combobox", { name: "Canalul mesajelor de bun venit și plecare" }).selectOption("777777777");
    await page.getByTestId("settings-welcome-style-medieval").click();
    await expect(page.getByTestId("settings-welcome-preview")).toContainText("porțile cetății");
    await page.getByTestId("button-save-settings").click();
    await expect.poll(() => botPuts.get(guilds[0].id)?.length).toBe(1);
    const body = botPuts.get(guilds[0].id)![0];
    expect(body.gameplayConfig.memberMessages).toEqual({ welcomeEnabled: true, leaveEnabled: false, channelId: "777777777", style: "medieval", customStyle: "" });
    expect(body).not.toHaveProperty("oracle");
    expect(configPuts).toEqual([]);
  });
});

test.describe("bot control page", () => {
  const controlConfig = () => ({
    ...verificationBotControlConfig(false, ""),
    channels: { main: "777777777" },
    gameplayConfig: {
      paused: false,
      messages: { gamePaused: "Jocul e oprit.", oraclePaused: "Oracolul e oprit.", gamePausedImageUrl: "", gamePausedThumbnailUrl: "", oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "" },
      memberMessages: { welcomeEnabled: false, leaveEnabled: false, channelId: "", style: "normal", customStyle: "" },
    },
    dailyStats: {
      channelId: "", title: "Statistici {guild}", description: "Raport {date}", color: "#5865F2", footer: "Oracolul",
      activityTitle: "Activitate", channelsTitle: "Canale", emptyChannelsText: "Nimic azi.", imageUrl: "", thumbnailUrl: "",
      metricLabels: { messages: "Mesaje", uniqueUsers: "Unici", boosts: "Boost", joins: "Intrări", leaves: "Ieșiri", peakVoice: "Voce" },
    },
    inviteTracking: {
      enabled: false, joinLogChannelId: "", reportEnabled: false, reportChannelId: "", reportFrequency: "daily", reportTime: "09:00", reportWeekday: 1,
      reportTimeZone: "Europe/Bucharest", reportTopLimit: 5,
      recruitment: {
        enabled: false, inviteChannelId: "", maxUses: 1, maxAgeDays: 7, dailyInviteLimit: 3, verificationHours: 24, rewardPoints: 10,
        milestones: [{ requiredInvites: 1, roleId: "" }, { requiredInvites: 5, roleId: "" }, { requiredInvites: 10, roleId: "" }],
      },
    },
  });
  async function openControl(page: import("@playwright/test").Page, path = "/moderare/control") {
    const putBodies = await installPartialBotControlFixture(page, new Map([
      [guilds[0].id, controlConfig() as any], [guilds[1].id, controlConfig() as any],
    ]));
    const provisions: any[] = [];
    await page.route("**/api/moderation/guilds/*/invite-stats**", async (route) => {
      await route.fulfill({ json: { range: "7", startDay: "2026-10-23", endDay: "2026-10-29", totals: { attributedJoins: 4, unknownJoins: 1 }, rows: [] } });
    });
    await page.route("**/api/moderation/guilds/*/bot-control/provision-channels", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      provisions.push(body);
      await route.fulfill({ json: {
        ...controlConfig(), provisioningPermissions: body.permissions, discordLive: true,
        provisioning: { created: [{ key: "audit.channelId", id: "1", name: "mod-audit", type: "text" }], reused: [], verificationPanel: "not_requested" },
      } });
    });
    await page.route("**/api/moderation/guilds/*/metadata", async (route) => {
      const guildId = route.request().url().match(/guilds\/(\d+)\/metadata/)?.[1] ?? guilds[0].id;
      await route.fulfill({ json: {
        guild: { id: guildId, name: guilds.find((guild) => guild.id === guildId)?.name ?? guilds[0].name, ownerId: "999999999" },
        roles: [
          { id: guildId, name: "@everyone", position: 0, managed: false },
          { id: "444444444", name: "Verified", position: 2, managed: false },
          { id: "666666666", name: "Moderator", position: 8, managed: false },
        ],
        channels: [{ id: "777777777", name: "cufere", type: 0 }, { id: "444444444", name: "invitatii", type: 0 }],
        emojis: [],
        botCapabilities: { online: true, messageContent: true, guildMembers: true, canManageGuild: true, canManageChannels: true, canManageRoles: true, canBanMembers: false },
      } });
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: guilds[0].name }).click();
    await expect(page.getByTestId("control-page")).toBeVisible();
    return { putBodies, provisions };
  }

  test("tracks invitations with a weekly report and saves the daily report's channel", async ({ page }) => {
    const { putBodies } = await openControl(page);
    await expect(page.getByRole("heading", { name: "Invitații", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Modulele controlului" }).getByRole("link")).toHaveCount(5);
    await page.getByTestId("control-invites-switch").click();
    await page.getByTestId("control-invites-report-switch").click();
    await page.getByRole("combobox", { name: "Canalul raportului de invitații" }).selectOption("444444444");
    await page.getByTestId("control-invites-frequency").getByRole("radio", { name: "Săptămânal" }).click();
    await page.getByTestId("control-invites-weekday").getByRole("radio", { name: "V" }).click();
    await expect(page.getByTestId("control-invites-report")).toContainText("în fiecare vineri la 09:00");
    await page.getByTestId("nav-control-daily").click();
    const daily = page.getByRole("combobox", { name: "Canalul raportului zilnic" });
    await expect(daily.locator("option", { hasText: "cufere" })).toHaveCount(0);
    await daily.selectOption("444444444");
    await page.getByTestId("button-save-control").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    const body = putBodies.get(guilds[0].id)![0];
    expect(body.inviteTracking).toMatchObject({ enabled: true, reportEnabled: true, reportChannelId: "444444444", reportFrequency: "weekly", reportWeekday: 5 });
    expect(body.dailyStats.channelId).toBe("444444444");
    expect(body).not.toHaveProperty("oracle");
  });

  test("shows the daily report with the day's card and can post it without the card", async ({ page }) => {
    const { putBodies } = await openControl(page, "/moderare/control/raport");
    await page.getByRole("combobox", { name: "Canalul raportului zilnic" }).selectOption("444444444");
    await expect(page.getByTestId("control-daily-chart")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("control-daily-card")).toBeVisible();
    await expect(page.getByTestId("control-daily-summary")).toContainText("Mesaje: 307 · ▲ +131");
    await expect(page.getByTestId("control-daily-summary")).toContainText("Bilanț: +3 membri");
    await expect(page.getByTestId("control-daily-channels")).toContainText("🥇 #general · 124 mesaje · 40%");
    await expect(page.getByTestId("control-daily-week")).not.toContainText("Vi 23");
    await page.getByTestId("control-daily-chart").click();
    await expect(page.getByTestId("control-daily-card")).toHaveCount(0);
    await expect(page.getByTestId("control-daily-week")).toContainText("Vi 23: 48");
    await page.getByTestId("button-save-control").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)![0].dailyStats).toMatchObject({ channelId: "444444444", chart: false });
  });

  test("asks the recruitment program for its channel and warns while verification is off", async ({ page }) => {
    const { putBodies } = await openControl(page, "/moderare/control/recrutare");
    await page.getByTestId("control-recruitment-switch").click();
    await expect(page.getByTestId("control-recruitment-verification")).toBeVisible();
    await expect(page.getByTestId("control-recruitment-problem")).toContainText("canalul");
    await page.getByTestId("button-save-control").click();
    expect(putBodies.size).toBe(0);
    await page.getByRole("combobox", { name: "Canalul invitațiilor personale" }).selectOption("444444444");
    await page.getByTestId("control-recruitment-rewardPoints").fill("40");
    await page.getByRole("combobox", { name: "Rolul pentru pragul 3" }).selectOption("666666666");
    await expect(page.getByTestId("control-recruitment-preview")).toContainText("40 puncte");
    await page.getByTestId("button-save-control").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    expect(putBodies.get(guilds[0].id)![0].inviteTracking.recruitment).toMatchObject({
      enabled: true, inviteChannelId: "444444444", rewardPoints: 40, milestones: [{ requiredInvites: 1 }, { requiredInvites: 5 }, { requiredInvites: 10, roleId: "666666666" }],
    });
  });

  test("saves a category's access first, then creates its channels with that access", async ({ page }) => {
    const { putBodies, provisions } = await openControl(page, "/moderare/control/canale");
    await page.getByTestId("control-category-admin-access").click();
    await page.getByTestId("control-access-admin").getByRole("button", { name: "Adaugă rolul Moderator" }).click();
    await page.getByTestId("control-access-admin").getByRole("checkbox", { name: "@Moderator: scrie" }).click();
    await page.getByTestId("control-category-admin").getByRole("checkbox", { name: "Creează Administrație" }).click();
    await expect(page.getByTestId("control-provision")).toBeDisabled();
    await page.getByTestId("button-save-control").click();
    await expect.poll(() => putBodies.get(guilds[0].id)?.length).toBe(1);
    await page.getByTestId("control-provision").click();
    await page.getByTestId("control-provision-go").click();
    await expect.poll(() => provisions.length).toBe(1);
    expect(provisions[0]).toEqual({
      categories: ["admin"],
      permissions: { admin: {
        roleIds: ["666666666"], readMessageHistory: true, sendMessages: true,
        rolePermissions: { "666666666": { viewChannel: true, readMessageHistory: true, sendMessages: false } },
      } },
    });
    await expect(page.getByTestId("control-provision-result")).toContainText("1 canal creat");
  });

  test("old addresses lead here and the bot's missing permissions are shown", async ({ page }) => {
    await openControl(page, "/moderare/provisioning");
    await expect(page).toHaveURL("/moderare/control/canale");
    await page.getByTestId("nav-control-server").click();
    await expect(page.getByTestId("control-checks")).toContainText("Ban Members");
    await expect(page.getByTestId("control-checks").locator("li.is-bad")).toHaveCount(1);
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
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
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

  const mockChooserSession = async (page: import("@playwright/test").Page) => {
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
  };

  test("marks the official server and lists it first", async ({ page }) => {
    await page.route("**/api/moderation/public/server-profile", async (route) => {
      await route.fulfill({
        json: { name: "Turnul Gol", iconUrl: null, inviteUrl: "https://discord.gg/turnul", guildId: guilds[1].id },
      });
    });
    await mockChooserSession(page);
    await page.goto("/moderare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    const items = page.getByRole("list", { name: "Servere eligibile" }).getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("Turnul Gol");
    await expect(items.first()).toContainText("Oficial");
    await expect(items.last()).toContainText("Cenușa Nordului");
    await expect(items.last()).not.toContainText("Oficial");
  });

  test("chooses a server with the keyboard", async ({ page }) => {
    await mockChooserSession(page);
    await page.goto("/moderare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Turnul Gol" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox").first()).toContainText("Turnul Gol");
  });

  test("a signed-in operator opens the panel from the start page without a new sign-in", async ({ page }) => {
    let oauthRequests = 0;
    await page.route("**/api/moderation/oauth/discord", async (route) => {
      oauthRequests += 1;
      await route.fulfill({ status: 204 });
    });
    await mockChooserSession(page);
    await page.goto("/");
    await expect(page.getByTestId("operator-gate")).toBeVisible();
    await expect(page.getByTestId("gate-signed-in")).toBeVisible();
    await expect(page.getByTestId("discord-login-button")).toHaveCount(0);
    await expect(page.getByTestId("button-open-panel")).toHaveAttribute("href", "/moderare");
    await expect(page.getByTestId("link-server-guide-login")).toHaveAttribute("href", "/server");
    await page.getByTestId("button-open-panel").click();
    await expect(page).toHaveURL("/moderare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    expect(oauthRequests).toBe(0);
  });

  test("signs out from the chooser and returns to the operator login", async ({ page }) => {
    await mockChooserSession(page);
    await page.route("**/api/moderation/logout", async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/moderare");
    await expect(page.getByRole("heading", { name: "Alege serverul" })).toBeVisible({ timeout: 15_000 });
    const logoutRequest = page.waitForRequest((request) => request.url().endsWith("/api/moderation/logout") && request.method() === "POST");
    await page.getByTestId("button-guild-logout").click();
    expect((await logoutRequest).headers()["x-csrf-token"]).toBe("test-csrf");
    await expect(page.getByTestId("operator-gate")).toBeVisible();
  });
});
