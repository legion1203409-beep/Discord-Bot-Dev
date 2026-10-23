import { expect, test, type Page } from "@playwright/test";

const communityInvite = "https://discord.gg/regatulcenusii";
const guildId = "123456789012345678";
const heroTitle = "Un loc pentru oameni și povești.";

/** Datele publice ale paginii principale, fixe, ca testele să nu depindă de serverul real. */
async function mockPublicApi(page: Page) {
  await page.route("**/api/discord/stats", route =>
    route.fulfill({ json: { live: true, onlineCount: 85, totalMembers: 1014, lastJoined: null } }));
  await page.route("**/api/discord/daily-stats", route =>
    route.fulfill({
      json: {
        guildName: "Regatul Cenușii",
        timezone: "Europe/Bucharest",
        report: {
          guildId,
          day: "2026-10-21",
          metrics: { messages: 395, uniqueUsers: 13, boosts: 0, joins: 3, leaves: 6, peakVoice: 2 },
          activity: [],
          topChannels: [
            { channelId: "1", channelName: "hanul-general", messages: 391 },
            { channelId: "2", channelName: "turnul-numerelor", messages: 3 },
          ],
        },
      },
    }));
  await page.route("**/api/moderation/public/server-profile", route =>
    route.fulfill({ json: { name: "Regatul Cenușii", iconUrl: null, inviteUrl: communityInvite, guildId } }));
  await page.route("**/api/moderation/verification/recruitment**", route =>
    route.fulfill({ json: { guildId, guildName: "Regatul Cenușii", enabled: false, viewer: null, leaderboard: [] } }));
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/moderation/session", route =>
    route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/moderation/auth-config", route =>
    route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } }));
  await mockPublicApi(page);
});

test("home shows the public server page instead of the moderation login", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toContainText(heroTitle);
  await expect(page).toHaveTitle(/Regatul Cenușii/);
  await expect(page.getByTestId("discord-login-button")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("h1")).toContainText(heroTitle);
  expect(errors).toEqual([]);
});

test("home shows the live numbers and the daily report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("data-online-count")).toContainText("85");
  await expect(page.getByTestId("data-total-members")).toContainText("1.014");
  await expect(page.getByTestId("data-daily-metrics")).toContainText("395");
  await expect(page.getByTestId("data-report-day")).toHaveText("21 octombrie 2026");
  await expect(page.getByTestId("section-recruitment")).toContainText("nu este activ");
});

test("the Oracle answers from the archive using the live numbers", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("section-oracle").scrollIntoViewIfNeeded();
  await page.getByTestId("button-oracle-suggestion-2").click();
  await expect(page.getByTestId("text-oracle-question")).toHaveText("Cât de activ e serverul?");
  await expect(page.getByTestId("text-oracle-reply")).toContainText("1.014");
  await expect(page.getByTestId("text-oracle-reply")).toContainText("395");

  const input = page.getByTestId("input-oracle-question");
  await input.fill("ce preț are un cartof?");
  await input.press("Enter");
  await expect(page.getByTestId("text-oracle-reply").nth(1)).toContainText("Arhiva mea nu are încă un răspuns");

  await page.getByTestId("button-oracle-new").click();
  await expect(page.getByTestId("text-oracle-question")).toHaveCount(0);
  await expect(page.getByTestId("button-oracle-suggestion-0")).toBeVisible();
});

test("operator status stays reachable behind #status", async ({ page }) => {
  await page.goto("/#status");
  await expect(page.locator("h1.ops-title")).toContainText("Starea operatorului");
  await page.getByRole("link", { name: /Înapoi la pagina principală/ }).click();
  await expect(page.locator("h1")).toContainText(heroTitle);
});

test("/joc still leads to the server page", async ({ page }) => {
  await page.goto("/joc");
  await expect(page).toHaveURL("/server");
  await expect(page.locator("h1")).toContainText(heroTitle);
});

test("shows the Discord loading screen for at least two seconds", async ({ page }) => {
  await page.goto("/moderare");
  const loadingScreen = page.getByRole("status", { name: "Se încarcă panoul de moderare" });
  await expect(loadingScreen).toBeVisible();
  await page.waitForTimeout(500);
  await expect(loadingScreen).toBeVisible();
  await expect(loadingScreen).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
});

test("home is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(`a[href="${communityInvite}"]:visible`).first()).toBeVisible();

  await page.getByTestId("button-server-guide-menu").click();
  await page.locator('details.menuWrap a[href="#oracol"]').click();
  await expect(page).toHaveURL(/#oracol$/);
  await expect(page.getByTestId("section-oracle")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the footer reaches the operator console and the public pages", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("link-footer-moderation").click();
  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await page.goBack();
  await expect(page.locator("h1")).toContainText(heroTitle);
  await page.getByTestId("link-footer-stats").click();
  await expect(page).toHaveURL("/statistici");
});

for (const route of ["/", "/server"]) {
  test(`community invitations on ${route} use the verified server link`, async ({ page }) => {
    await page.goto(route);
    const inviteLinks = page.locator('a[href^="https://discord.gg/"]');
    await expect(inviteLinks.first()).toBeAttached();
    for (const link of await inviteLinks.all()) {
      await expect(link).toHaveAttribute("href", communityInvite);
      if (await link.getAttribute("target") === "_blank") {
        await expect(link).toHaveAttribute("rel", /noopener|noreferrer/);
      }
    }
    await expect(page.locator('a[href*="JNYsGeMhzm"]')).toHaveCount(0);
  });
}
