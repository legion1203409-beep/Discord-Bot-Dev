import { expect, test, type Locator, type Page } from "@playwright/test";

const ticket = "one-time-verification-ticket";

async function openVerificationPage(page: Page) {
  const submittedBodies: unknown[] = [];

  await page.route("**/api/moderation/verification/complete", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    submittedBodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ json: { verified: true, result: "verified" } });
  });

  await page.goto(`/verificare#ticket=${encodeURIComponent(ticket)}`);

  return {
    submittedBodies,
    slider: page.getByTestId("slider-verification-completion"),
    completeButton: page.getByTestId("button-complete-verification"),
  };
}

async function expectSuccessfulSubmission(page: Page, completeButton: Locator) {
  await expect(completeButton).toContainText("Verificare confirmată");
  await expect(page.getByText("Totul e gata. Te poți întoarce în Discord.")).toBeVisible();
}

test.describe("public member verification slider", () => {
  test("pointer drag only enables completion at the endpoint and submits on click", async ({ page }) => {
    const { submittedBodies, slider, completeButton } = await openVerificationPage(page);
    await expect(slider).toHaveValue("0");
    await expect(completeButton).toBeDisabled();
    expect(submittedBodies).toEqual([]);

    const bounds = await slider.boundingBox();
    expect(bounds).not.toBeNull();
    const { x, y, width, height } = bounds!;
    const startX = x + 24;
    const centerY = y + height / 2;

    await page.mouse.move(startX, centerY);
    await page.mouse.down();
    await page.mouse.move(x + width - 30, centerY, { steps: 12 });
    await page.mouse.up();

    const partialValue = Number(await slider.inputValue());
    expect(partialValue).toBeGreaterThan(0);
    expect(partialValue).toBeLessThan(1000);
    await expect(completeButton).toBeDisabled();
    expect(submittedBodies).toEqual([]);

    const thumbX = x + 24 + (width - 48) * partialValue / 1000;
    await page.mouse.move(thumbX, centerY);
    await page.mouse.down();
    await page.mouse.move(x + width - 24, centerY, { steps: 12 });
    await page.mouse.up();

    await expect(slider).toHaveValue("1000");
    await expect(completeButton).toBeEnabled();
    expect(submittedBodies).toEqual([]);

    await completeButton.click();
    await expectSuccessfulSubmission(page, completeButton);
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);
  });

  test("touch drag reaches the endpoint without submitting until the button is tapped", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { submittedBodies, slider, completeButton } = await openVerificationPage(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });

    await expect(completeButton).toBeDisabled();
    const bounds = await slider.boundingBox();
    expect(bounds).not.toBeNull();
    const { x, y, width, height } = bounds!;
    const startX = x + 24;
    const centerY = y + height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: startX, y: centerY }],
    });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x: startX + (width - 48) * step / 12, y: centerY }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(slider).toHaveValue("1000");
    await expect(completeButton).toBeEnabled();
    expect(submittedBodies).toEqual([]);
    await completeButton.click();
    await expectSuccessfulSubmission(page, completeButton);
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);
    await cdp.detach();
  });

  test("keyboard users can reach the endpoint, see focus, and explicitly submit the ticket", async ({ page }) => {
    const { submittedBodies, slider, completeButton } = await openVerificationPage(page);
    await expect(completeButton).toBeDisabled();
    expect(submittedBodies).toEqual([]);

    await page.keyboard.press("Tab");
    await expect(slider).toBeFocused();
    await expect.poll(() => slider.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect.poll(() => slider.locator("xpath=following-sibling::*[1]").evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");

    await page.keyboard.press("End");
    await expect(slider).toHaveValue("1000");
    await expect(completeButton).toBeEnabled();
    expect(submittedBodies).toEqual([]);

    await completeButton.click();
    await expectSuccessfulSubmission(page, completeButton);
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);
  });
});
