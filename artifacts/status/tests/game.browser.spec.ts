import { expect, test, type Page } from "@playwright/test";

const communityInvite = "https://discord.gg/regatulcenusii";
const guildId = "123456789012345678";
const heroTitle = "Un loc pentru oameni și povești.";

/** Datele publice ale paginii serverului, fixe, ca testele să nu depindă de serverul real. */
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

test("the root is the start page with both doors, not the server guide", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("operator-gate")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Regatul Cenușii" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Panoul botului" })).toBeVisible();
  await expect(page.getByText(heroTitle)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("operator-gate")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Intră în regat leads from the start page to the community page and back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Intră în regat" }).click();
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
  await expect(page).toHaveTitle(/Regatul Cenușii/);
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("operator-gate")).toBeVisible();
});

test("the bot panel door on the start page starts the Discord login", async ({ page }) => {
  await page.route("**/api/moderation/oauth/discord", route => route.fulfill({ status: 204 }));
  await page.goto("/");
  const panelDoor = page.getByTestId("button-open-panel");
  await expect(panelDoor).toHaveAttribute("href", "/api/moderation/oauth/discord");
  const oauthRequest = page.waitForRequest("**/api/moderation/oauth/discord");
  await panelDoor.click();
  expect((await oauthRequest).url()).toContain("/api/moderation/oauth/discord");
});

test("an existing Discord session opens the server picker without starting OAuth", async ({ page }) => {
  await page.unroute("**/api/moderation/session");
  await page.route("**/api/moderation/session", route =>
    route.fulfill({
      json: {
        authenticated: true,
        userId: "operator-1",
        guilds: [{ id: guildId, name: "Regatul Cenușii", icon: null }],
        csrfToken: "test-csrf",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    }));

  let oauthRequests = 0;
  await page.route("**/api/moderation/oauth/discord", route => {
    oauthRequests += 1;
    return route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page.getByTestId("gate-signed-in")).toBeVisible();
  const panelDoor = page.getByTestId("button-open-panel");
  await expect(panelDoor).toHaveAttribute("href", "/moderare");
  await panelDoor.click();

  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("operator-picker")).toBeVisible();
  await expect(page.getByTestId(`button-select-guild-${guildId}`)).toBeVisible();
  expect(oauthRequests).toBe(0);
});

test("the community door stays open on the start page while sign-in is unavailable", async ({ page }) => {
  await page.unroute("**/api/moderation/auth-config");
  await page.route("**/api/moderation/auth-config", route =>
    route.fulfill({ json: { discordOAuthConfigured: false, authorizationUrl: "/api/moderation/oauth/discord" } }));
  await page.goto("/");
  await expect(page.getByTestId("button-open-panel")).toBeDisabled();
  await page.getByRole("link", { name: "Intră în regat" }).click();
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
});

test("the start page is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("operator-gate")).toBeVisible();
  await expect(page.getByRole("link", { name: "Intră în regat" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("/server shows the community page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/server");
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
  await expect(page).toHaveTitle(/Regatul Cenușii/);
  await expect(page.getByTestId("discord-login-button")).toHaveCount(0);
  await expect(page.getByTestId("operator-gate")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
  expect(errors).toEqual([]);
});

test("the community page shows the live numbers and the daily report", async ({ page }) => {
  await page.goto("/server");
  await expect(page.getByTestId("data-online-count")).toContainText("85");
  await expect(page.getByTestId("data-total-members")).toContainText("1.014");
  await expect(page.getByTestId("data-daily-metrics")).toContainText("395");
  await expect(page.getByTestId("data-report-day")).toHaveText("21 octombrie 2026");
  await expect(page.getByTestId("section-recruitment")).toContainText("nu este activ");
});

test("the Oracle answers from the archive using the live numbers", async ({ page }) => {
  await page.goto("/server");
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
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("operator-gate")).toBeVisible();
});

test("/joc still leads to the server page", async ({ page }) => {
  await page.goto("/joc");
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
});

test("the logged-out moderation route shows the Discord login gate", async ({ page }) => {
  await page.goto("/moderare");
  await expect(page.getByTestId("operator-gate")).toBeVisible();
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
});

for (const route of ["/", "/moderare"]) {
  test(`${route} explains a cancelled Discord login and lets the operator retry`, async ({ page }) => {
    await page.route("**/api/moderation/oauth/discord", route =>
      route.fulfill({ status: 204 }));
    await page.goto(`${route}?auth_error=cancelled`);

    const error = page.getByRole("alert");
    await expect(error).toContainText("Autentificarea a fost anulată");
    const retry = page.getByTestId("discord-login-button");
    await expect(retry).toBeVisible();
    await expect(retry).toHaveAttribute("href", "/api/moderation/oauth/discord");

    const oauthRequest = page.waitForRequest("**/api/moderation/oauth/discord");
    await retry.click();
    expect((await oauthRequest).method()).toBe("GET");
  });

  test(`${route} hides an unknown Discord login error code`, async ({ page }) => {
    const unknownCode = "discord_private_reason_907";
    await page.goto(`${route}?auth_error=${unknownCode}`);

    const error = page.getByRole("alert");
    await expect(error).toContainText("Autentificarea Discord nu a putut fi finalizată");
    await expect(error).not.toContainText(unknownCode);
    await expect(page.getByTestId("discord-login-button")).toBeVisible();
  });
}

test("the community door stays usable after a failed Discord login", async ({ page }) => {
  await page.goto("/?auth_error=cancelled");
  await expect(page.getByRole("alert")).toContainText("Autentificarea a fost anulată");
  await page.getByRole("link", { name: "Intră în regat" }).click();
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
});

test("the community page is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/server");
  await expect(page.locator("#h-hero")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(`a[href="${communityInvite}"]:visible`).first()).toBeVisible();

  await page.getByTestId("button-server-guide-menu").click();
  await page.locator('details.menuWrap a[href="#oracol"]').click();
  await expect(page).toHaveURL(/#oracol$/);
  await expect(page.getByTestId("section-oracle")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the mobile menu closes when tapping outside it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/server");
  const menu = page.locator("details.menuWrap");
  await page.getByTestId("button-server-guide-menu").click();
  await expect(menu).toHaveAttribute("open", "");
  // Marginea din stânga a barei de sus: în afara meniului, dar fără link sau buton.
  await page.mouse.click(5, 5);
  await expect(menu).not.toHaveAttribute("open", "");
});

test("the footer reaches the operator console and the public pages", async ({ page }) => {
  await page.goto("/server");
  await page.getByTestId("link-footer-moderation").click();
  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/server");
  await expect(page.locator("#h-hero")).toContainText(heroTitle, { useInnerText: true });
  await page.getByTestId("link-footer-stats").click();
  await expect(page).toHaveURL("/statistici");
});

for (const route of ["/server"]) {
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
