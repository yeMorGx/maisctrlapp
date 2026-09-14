import { expect, test, type Page } from "@playwright/test";

const authStorageKey = "sb-wdmkzljxjjjvzofrpeuk-auth-token";
const fakeUserId = "00000000-0000-4000-8000-000000000001";
const fakeAccessToken = "eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJleHAiOjQxMDEwMDAwMDB9.";

async function seedLocalSession(page: Page) {
  await page.addInitScript(({ storageKey, accessToken, userId }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      access_token: accessToken,
      refresh_token: "local-test-refresh-token",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "local-test@maisctrl.app",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "Teste local" },
        identities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }, { storageKey: authStorageKey, accessToken: fakeAccessToken, userId: fakeUserId });
}

test("signup blocks weak passwords and exposes every requirement", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ainda não!" }).click();

  await page.getByLabel("Nome completo").fill("Teste local");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("E-mail").fill("local@maisctrl.app");
  await page.getByRole("button", { name: "Continuar" }).click();

  const password = page.getByLabel("Crie uma senha");
  const continueButton = page.getByRole("button", { name: "Continuar" });
  await password.fill("abc");
  await expect(continueButton).toBeDisabled();
  await expect(page.getByRole("list", { name: "Requisitos da senha" }).locator("li")).toHaveCount(5);

  await password.fill("Abcdef1!");
  await expect(continueButton).toBeEnabled();
  await expect(page.getByRole("list", { name: "Requisitos da senha" }).locator('li[data-valid="true"]')).toHaveCount(5);
});

test("signup keeps the focused field above the keyboard without scrolling or a decorative logo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ainda não!" }).click();
  await page.getByLabel("Nome completo").click();
  await page.waitForTimeout(250);

  const viewport = page.locator(".auth-signup-viewport");
  const name = page.locator("#signup-name");
  await expect(page.locator(".signup-brand-mark")).toHaveCount(0);
  await expect(page.locator("[data-testid='signup-screen'] .mobile-scroll")).toHaveCount(0);
  await expect.poll(async () => {
    return name.evaluate((element) => {
      const field = element.getBoundingClientRect();
      const keyboardViewport = element.closest(".auth-signup-viewport")?.getBoundingClientRect();
      return keyboardViewport ? keyboardViewport.bottom - field.bottom : -Infinity;
    });
  }).toBeGreaterThanOrEqual(0);
  await expect(viewport).toHaveAttribute("data-keyboard-visible", "true");
});

test("login keeps the focused fields above the simulated keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ainda não!" }).click();
  await page.getByRole("button", { name: "Entrar" }).last().click();

  const scroll = page.locator("[data-testid='login-screen'] .mobile-scroll");
  const email = page.getByLabel("E-mail");
  await email.fill("local@maisctrl.app");

  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => {
    return email.evaluate((element) => {
      const field = element.getBoundingClientRect();
      const viewport = element.closest(".mobile-scroll")?.getBoundingClientRect();
      return viewport ? viewport.bottom - field.bottom : -Infinity;
    });
  }).toBeGreaterThanOrEqual(0);

  const password = page.locator("#login-password");
  await password.focus();
  await expect.poll(async () => {
    return password.evaluate((element) => {
      const field = element.getBoundingClientRect();
      const viewport = element.closest(".mobile-scroll")?.getBoundingClientRect();
      return viewport ? viewport.bottom - field.bottom : -Infinity;
    });
  }).toBeGreaterThanOrEqual(0);
});

test("signup remains static when the keyboard closes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Ainda não!" }).click();
  await page.getByLabel("Nome completo").click();

  const viewport = page.locator(".auth-signup-viewport");
  const keyboard = page.getByTestId("keyboard-dock");
  await expect(page.locator("[data-testid='signup-screen'] .mobile-scroll")).toHaveCount(0);
  await expect(viewport).toHaveAttribute("data-keyboard-visible", "true");

  const keyboardBox = await keyboard.boundingBox();
  if (!keyboardBox) throw new Error("Keyboard has no bounding box");
  const startX = keyboardBox.x + keyboardBox.width / 2;
  const startY = keyboardBox.y + keyboardBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(startX, startY + (120 * step) / 6);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();

  await expect(keyboard).toHaveAttribute("data-visible", "false");
  await expect(viewport).toHaveAttribute("data-keyboard-visible", "false");
  await expect(page.locator("[data-testid='signup-screen'] .mobile-scroll")).toHaveCount(0);
});

test("welcome page stays fixed without a scroll container", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(900);

  await expect(page.getByTestId("mobile-scroll")).toHaveCount(0);

  const panel = page.locator(".auth-panel-welcome");
  const before = await panel.boundingBox();
  if (!before) throw new Error("Welcome action card has no bounding box");

  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(100);

  await expect(page.getByTestId("welcome-screen")).toBeVisible();
  await expect(page.getByTestId("signup-screen")).toHaveCount(0);

  const after = await panel.boundingBox();
  if (!after) throw new Error("Welcome action card disappeared after wheel input");
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test("finance entries stay available locally after navigation", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await page.context().setOffline(true);
  await expect(page.getByRole("status")).toContainText("Você está offline");
  await page.context().setOffline(false);

  await page.getByRole("button", { name: "Finanças" }).click();
  await expect(page.getByRole("heading", { name: "Finanças" })).toBeVisible();
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await page.getByLabel("Descrição").fill("Mercado");
  await page.getByLabel("Valor").fill("123,45");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();

  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await expect(page.getByText("Mercado")).toBeVisible();
  await expect(page.locator(".finance-entry-amount")).toContainText("123,45");

  await page.getByRole("button", { name: "Editar lançamento: Mercado" }).click();
  await page.getByLabel("Descrição").fill("Supermercado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Supermercado")).toBeVisible();

  await page.getByLabel("Buscar lançamento").fill("não existe");
  await expect(page.getByText("Nenhum lançamento encontrado")).toBeVisible();
  await page.getByLabel("Buscar lançamento").fill("");

  await page.reload();
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Finanças" }).click();
  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await expect(page.getByText("Mercado")).toBeVisible();
});
