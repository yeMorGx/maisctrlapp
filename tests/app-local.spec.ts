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

test("finance entries stay available locally after navigation", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Finanças" }).click();
  await expect(page.getByRole("heading", { name: "Finanças" })).toBeVisible();
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await page.getByLabel("Descrição").fill("Mercado");
  await page.getByLabel("Valor").fill("123,45");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();

  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await expect(page.getByText("Mercado")).toBeVisible();
  await expect(page.locator(".finance-entry-amount")).toContainText("123,45");
  await page.reload();
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Finanças" }).click();
  await page.getByRole("tab", { name: "Lançamentos" }).click();
  await expect(page.getByText("Mercado")).toBeVisible();
});
