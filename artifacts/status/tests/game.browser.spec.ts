import { expect, test } from "@playwright/test";

const communityInvite = "https://discord.gg/regatulcenusii";

test("public game category is reachable and survives a direct reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const homeTitle = await page.title();
  await page.locator('a[href="/joc"]:visible').first().click();
  await expect(page).toHaveURL("/joc");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page).toHaveTitle(/Joc|Ghid/i);
  await expect(page.locator("body")).toContainText("/profil");
  await expect(page.locator("body")).toContainText("/clasa");
  await expect(page.locator("body")).toContainText("/inventar");
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('a[href="/moderare"]:visible').first()).toBeVisible();
  await page.locator('a[href="/"]:visible').first().click();
  await expect(page).toHaveURL("/");
  await expect(page).toHaveTitle(homeTitle);
  expect(errors).toEqual([]);
});

for (const route of ["/", "/joc"]) {
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
    if (route === "/") {
      await expect(page.getByTestId("link-community-invite")).toHaveText(/discord.gg\/regatulcenusii/);
    }
  });
}

test("game category is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await expect(page.locator('a[href="/joc"]:visible').first()).toBeVisible();
  await page.locator('a[href="/joc"]:visible').first().click();
  await expect(page).toHaveURL("/joc");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deschide meniul" })).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(`a[href="${communityInvite}"]:visible`).first()).toBeVisible();
});