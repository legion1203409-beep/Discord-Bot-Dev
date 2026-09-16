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
  autoMod: { enabled: false, wordFilter: rule(), linkBlock: rule(), emojiLimit: rule(), capsLimit: rule(), repeatBlock: rule(), forbiddenWords: [], forbiddenLinks: [] },
  antiRaid: { enabled: false, joinsPerMinute: 10, accountAgeDays: 7, lockdown: false, alertChannelId: null, rule: rule() },
  antiSpam: { enabled: false, message: rule(), edit: rule(), delete: rule(), mention: rule(), emoji: rule(), logChannelId: null },
  antiFlood: { enabled: false, longMessage: rule(), character: rule(), caps: rule(), symbol: rule() },
  manualTools: { enabled: false, commandGrants: {}, logActions: false },
  cases: { enabled: false, allowStaffClose: true, allowStaffNotes: true, allowStaffExport: false, retentionDays: 365 },
  audit: { enabled: false, detailLevel: "standard", channelId: null },
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

test.describe("authenticated moderation console", () => {
  const savedConfigs = new Map(guilds.map(({ id }) => [id, fullConfig()]));
  let actionBodies: unknown[] = [];

  test.beforeEach(async ({ page }) => {
    actionBodies = [];
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

  test("renders every moderation destination instead of the work-in-progress fallback", async ({ page }) => {
    await page.goto("/moderare");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cenușa Nordului" })).toBeVisible();
    await page.screenshot({ path: "/tmp/moderation-dashboard-desktop.png", fullPage: true });
    for (const path of ["/automod", "/protectie", "/politici", "/comenzi", "/cazuri", "/audit", "/config"]) {
      await page.locator(`nav a[href="/moderare${path}"]`).click();
      await expect(page).toHaveURL(`/moderare${path}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText("Această secțiune este în lucru.")).toHaveCount(0);
    }
  });

  test("switches guilds without displaying stale config and persists a full save", async ({ page }) => {
    await page.goto("/moderare/config");
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

  test("supports mobile navigation without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/moderare");
    await chooseFirstGuild(page);
    await expect(page.getByRole("heading", { name: "Cenușa Nordului" })).toBeVisible();
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
    await page.goto("/moderare?auth_error=state_mismatch");
    await expect(page.getByTestId("discord-login-button")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Sesiunea de autentificare a expirat");
  });

  test("explains when the callback account has no eligible guild", async ({ page }) => {
    await page.goto("/moderare?auth_error=no_eligible_guild");
    await expect(page.getByRole("alert")).toContainText("botul este membru pe server");
    await expect(page.getByRole("alert")).toContainText("rol de staff sau administrator");
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
  });
});