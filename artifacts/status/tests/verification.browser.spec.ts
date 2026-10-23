import { expect, test, type Locator, type Page } from "@playwright/test";

const ticket = "one-time-verification-ticket";

type MockApiResponse = { status?: number; json: Record<string, unknown> };

async function openVerificationPage(
  page: Page,
  options: {
    ticketValue?: string | null;
    completionResponses?: MockApiResponse[];
    statusResponses?: MockApiResponse[];
  } = {},
) {
  const submittedBodies: unknown[] = [];
  let completionRequests = 0;
  let statusRequests = 0;

  await page.route("**/api/moderation/verification/complete", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const requestIndex = completionRequests++;
    submittedBodies.push(JSON.parse(route.request().postData() || "{}"));
    const response = options.completionResponses?.[requestIndex] ?? {
      json: { verified: true, result: "verified" },
    };
    await route.fulfill({ ...response, status: response.status ?? 200 });
  });
  await page.route("**/api/moderation/verification/status", async (route) => {
    const requestIndex = statusRequests++;
    const response = options.statusResponses?.[requestIndex] ?? { json: { verified: false } };
    await route.fulfill({ ...response, status: response.status ?? 200 });
  });

  const ticketValue = options.ticketValue === undefined ? ticket : options.ticketValue;
  const pageUrl = ticketValue === null ? "/verificare" : `/verificare#ticket=${encodeURIComponent(ticketValue)}`;
  await page.goto(pageUrl);

  return {
    submittedBodies,
    slider: page.getByTestId("slider-verification-completion"),
    completeButton: page.getByTestId("button-complete-verification"),
    completionRequests: () => completionRequests,
    statusRequests: () => statusRequests,
  };
}

async function expectSuccessfulSubmission(page: Page) {
  const success = page.getByTestId("status-verification-success");
  await expect(success).toBeVisible();
  await expect(success).toContainText("Verificarea a fost finalizată.");
  await expect(page.getByTestId("slider-verification-completion")).toHaveCount(0);
  await expect(page).toHaveURL(/\/verificare(?:\?.*)?$/);
  expect(await page.locator("body").innerText()).not.toContain(ticket);
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
    await expectSuccessfulSubmission(page);
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
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
    await expectSuccessfulSubmission(page);
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
    await expectSuccessfulSubmission(page);
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);
  });

  test("shows a clear missing-ticket state without exposing a ticket value", async ({ page }) => {
    const privateTicketValue = "private-ticket-should-not-be-rendered";
    const { statusRequests } = await openVerificationPage(page, {
      ticketValue: null,
      statusResponses: [{ json: { verified: false } }],
    });

    await expect(page.getByTestId("status-verification-ticket-missing")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(privateTicketValue);
    expect(statusRequests()).toBe(1);
  });

  test("keeps the bot-offline retry action available and refetches status", async ({ page }) => {
    const { statusRequests } = await openVerificationPage(page, {
      ticketValue: null,
      statusResponses: [
        { json: { verified: false, reason: "bot_offline" } },
        { json: { verified: false } },
      ],
    });

    await expect(page.getByTestId("status-verification-status-error")).toContainText("Botul Discord nu poate confirma starea acum.");
    const retryButton = page.getByTestId("button-retry-verification-status");
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await expect(page.getByTestId("status-verification-ticket-missing")).toBeVisible();
    expect(statusRequests()).toBe(2);
  });

  test("keeps the retry action after status loading fails", async ({ page }) => {
    const { statusRequests } = await openVerificationPage(page, {
      ticketValue: null,
      statusResponses: [
        { status: 503, json: { error: "temporary failure" } },
        { status: 503, json: { error: "temporary failure" } },
        { json: { verified: false } },
      ],
    });

    await expect(page.getByTestId("status-verification-status-error")).toContainText("Starea verificării nu a putut fi încărcată.");
    const retryButton = page.getByTestId("button-retry-verification-status");
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await expect(page.getByTestId("status-verification-ticket-missing")).toBeVisible();
    expect(statusRequests()).toBe(3);
  });

  test("does not expose an expired ticket value in the page or error", async ({ page }) => {
    const expiredTicket = "opaque-expired-ticket-value";
    const { submittedBodies, slider, completeButton } = await openVerificationPage(page, {
      ticketValue: expiredTicket,
      completionResponses: [{
        status: 400,
        json: { error: "Linkul este expirat sau a fost deja folosit. Solicită unul nou din Discord." },
      }],
    });
    await slider.focus();
    await page.keyboard.press("End");
    await completeButton.click();

    const error = page.getByTestId("status-verification-completion-error");
    await expect(error).toContainText("Linkul este expirat sau a fost deja folosit.");
    expect(await page.locator("body").innerText()).not.toContain(expiredTicket);
    expect(submittedBodies).toEqual([{ ticket: expiredTicket, sliderCompleted: true }]);
  });

  test("keeps completion errors visible and preserves progress for retry", async ({ page }) => {
    const temporaryError = "Botul Discord este ocupat temporar. Încearcă din nou.";
    const { submittedBodies, slider, completeButton } = await openVerificationPage(page, {
      completionResponses: [
        { status: 503, json: { error: temporaryError } },
        { json: { verified: true, result: "verified" } },
      ],
      statusResponses: [{ json: { verified: true } }],
    });
    await slider.focus();
    await page.keyboard.press("End");
    await completeButton.click();

    await expect(page.getByTestId("status-verification-completion-error")).toContainText(temporaryError);
    await expect(slider).toHaveValue("1000");
    await expect(completeButton).toBeEnabled();
    expect(submittedBodies).toEqual([{ ticket, sliderCompleted: true }]);

    await completeButton.click();
    await expectSuccessfulSubmission(page);
    expect(submittedBodies).toEqual([
      { ticket, sliderCompleted: true },
      { ticket, sliderCompleted: true },
    ]);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
  });
});
