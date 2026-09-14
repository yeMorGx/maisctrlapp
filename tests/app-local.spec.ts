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
  await page.waitForTimeout(350);

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

test("password recovery deep link opens the new password form", async ({ page }) => {
  await page.addInitScript(({ launchUrl }) => {
    const globalWindow = window as typeof window & {
      CapacitorCustomPlatform?: { name: string };
      Capacitor?: Record<string, unknown>;
    };

    globalWindow.CapacitorCustomPlatform = { name: "android" };
    globalWindow.Capacitor = {
      PluginHeaders: [
        {
          name: "App",
          methods: [
            { name: "addListener", rtype: "callback" },
            { name: "removeListener", rtype: "promise" },
            { name: "getLaunchUrl", rtype: "promise" },
          ],
        },
        { name: "SystemBars", methods: [{ name: "setStyle", rtype: "promise" }] },
      ],
      nativeCallback: () => Promise.resolve("local-app-callback"),
      nativePromise: (_plugin: string, method: string) => method === "getLaunchUrl"
        ? Promise.resolve({ url: launchUrl })
        : Promise.resolve(),
    };
  }, {
    launchUrl: `maisctrl://auth/callback#access_token=${fakeAccessToken}&refresh_token=local-recovery-refresh&type=recovery`,
  });
  await page.route("**/auth/v1/user", async (route) => {
    const user = {
      id: fakeUserId,
      aud: "authenticated",
      role: "authenticated",
      email: "local-test@maisctrl.app",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: "Teste local" },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user }),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("password-recovery-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByLabel("Nova senha", { exact: true }).fill("Abcdef1!");
  await page.getByLabel("Confirme a nova senha", { exact: true }).fill("Abcdef1!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("status")).toContainText("Sua senha foi atualizada com sucesso.");
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

test("dashboard navigation uses a floating dock with a clear active tab", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(navigation.getByRole("button", { name: "Perfil", exact: true })).toHaveCount(0);
  await expect(navigation).toHaveCSS("border-radius", "28px");
  await expect(navigation).toHaveCSS("right", "12px");
  const navigationBox = await navigation.boundingBox();
  const dashboardBox = await page.getByTestId("dashboard-screen").boundingBox();
  if (!navigationBox || !dashboardBox) throw new Error("Navigation or dashboard has no bounding box");
  expect(navigationBox.y).toBeGreaterThan(dashboardBox.y + dashboardBox.height / 2);
  expect(navigationBox.y + navigationBox.height).toBeLessThanOrEqual(dashboardBox.y + dashboardBox.height);
  await expect(navigation.getByRole("button", { name: "Início", exact: true })).toHaveAttribute("data-active", "true");

  await navigation.getByRole("button", { name: "Finanças", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "Finanças", exact: true })).toHaveAttribute("data-active", "true");
  await expect(navigation.getByRole("button", { name: "Início", exact: true })).toHaveAttribute("data-active", "false");
});

test("cards show a branded visual summary and swipe horizontally when there is more than one", async ({ page }) => {
  await seedLocalSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("maisctrl-local-cards-v1", JSON.stringify([
      { id: "card-nubank", name: "Nubank", last4: "0000", limit: 2500, used: 588, closingDay: 10, dueDay: 17 },
      { id: "card-inter", name: "Banco Inter", last4: "1234", limit: 4800, used: 920, closingDay: 12, dueDay: 19 },
    ]));
  });
  await page.route("https://api.github.com/repos/yeMorGx/maisctrlapp/releases/tags/android-latest", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "MaisCtrl Android 0.1.53", body: "Versão: 0.1.53", published_at: "2026-09-14T12:00:00Z", assets: [{ name: "maisctrl.apk", browser_download_url: "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk" }] }),
  }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: /Cartões e faturas/ }).click();
  await expect(page.getByRole("heading", { name: "Seus cartões", exact: true })).toBeVisible();

  const cards = page.getByTestId("payment-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Nubank");
  await expect(cards.nth(0)).toContainText("Fatura");
  await expect(cards.nth(0)).toContainText("Disponível");
  await expect(cards.nth(0)).toContainText("Limite");

  const carousel = page.locator(".payment-card-carousel");
  const scrollMetrics = await carousel.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    contentClass: element.firstElementChild?.className,
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
  expect(scrollMetrics.contentClass).toContain("payment-card-carousel-track");
  await carousel.evaluate((element) => {
    const scroll = element as HTMLElement;
    scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
  });
  await expect.poll(() => carousel.evaluate((element) => (element as HTMLElement).scrollLeft)).toBeGreaterThan(0);
});

test("opens the Android update inside a centered modal", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("https://api.github.com/repos/yeMorGx/maisctrlapp/releases/tags/android-latest", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "MaisCtrl Android 9.9.9 — versão de teste",
      body: "Versão: 9.9.9\nBuild: 999",
      published_at: "2026-09-14T12:00:00Z",
      assets: [{ name: "maisctrl.apk", browser_download_url: "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk" }],
    }),
  }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));

  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("app-update-banner")).toHaveCount(0);
  const trigger = page.getByTestId("app-update-trigger");
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();

  const update = page.getByTestId("app-update-modal");
  await expect(update).toBeVisible();
  await expect(update).toContainText("Nova versão disponível");
  await expect(update).toContainText("MaisCtrl 9.9.9");
  await expect(update).toContainText("Você pode continuar por");
  await expect(update).toContainText("6h");
  await expect(update.getByRole("link", { name: "Baixar MaisCtrl 9.9.9" })).toHaveAttribute("href", "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk");
  await expect(update.getByRole("link")).toHaveAttribute("download", "maisctrl.apk");

  await page.getByRole("button", { name: "Fechar atualização" }).click();
  await expect(update).toBeHidden();
});

test("blocks the app when the Android update grace period expires", async ({ page }) => {
  await seedLocalSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("maisctrl-update-grace-v1", JSON.stringify({
      version: "9.9.9",
      startedAt: 0,
      expiresAt: 1,
    }));
  });
  await page.route("https://api.github.com/repos/yeMorGx/maisctrlapp/releases/tags/android-latest", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "MaisCtrl Android 9.9.9 — versão de teste",
      body: "Versão: 9.9.9\nBuild: 999",
      published_at: "2026-09-14T12:00:00Z",
      assets: [{ name: "maisctrl.apk", browser_download_url: "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk" }],
    }),
  }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));

  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  const update = page.getByTestId("app-update-modal");
  await expect(update).toBeVisible({ timeout: 5_000 });
  await expect(update).toContainText("Atualização obrigatória");
  await expect(update).toContainText("Atualize para continuar");
  await expect(page.getByTestId("app-update-trigger")).toHaveAttribute("data-locked", "true");
  await expect(page.getByRole("button", { name: "Fechar atualização" })).toHaveCount(0);
  await expect(update.getByRole("link", { name: "Baixar MaisCtrl 9.9.9" })).toHaveAttribute("href", "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk");
});

test("known subscription names load their logo from the CDN", async ({ page }) => {
  await seedLocalSession(page);
  const logoUrl = "https://cdn.simpleicons.org/netflix";
  await page.route("https://cdn.simpleicons.org/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "image/svg+xml" },
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M4 4h16v16H4z\"/></svg>",
  }));
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("/subscriptions?")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{
          id: "subscription-netflix",
          name: "Netflix",
          value: 29.9,
          frequency: "monthly",
          payment_method: "credit",
          renewal_date: "2026-09-20T00:00:00.000Z",
          trial_end_date: null,
        }]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "[]",
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  const subscriptionAvatar = page.getByTestId("subscription-avatar").first();
  await expect(subscriptionAvatar).toHaveAttribute("data-has-logo", "true");
  await expect(subscriptionAvatar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(subscriptionAvatar.locator("img")).toHaveAttribute("src", logoUrl);
});

test("bank and academy names resolve to logo CDNs", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("https://cdn.simpleicons.org/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "image/svg+xml" },
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M4 4h16v16H4z\"/></svg>",
  }));
  await page.route("https://icons.duckduckgo.com/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "image/svg+xml" },
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/></svg>",
  }));
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("/subscriptions?")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { id: "subscription-nubank", name: "Nubank", value: 49.9, frequency: "monthly", payment_method: "credit", renewal_date: "2026-09-20T00:00:00.000Z", trial_end_date: null },
          { id: "subscription-smart-fit", name: "Smart Fit", value: 99.9, frequency: "monthly", payment_method: "debit", renewal_date: "2026-09-22T00:00:00.000Z", trial_end_date: null },
        ]),
      });
      return;
    }

    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: "[]" });
  });
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  const avatars = page.getByTestId("subscription-avatar");
  await expect(avatars.nth(0)).toHaveAttribute("data-logo-source", "simple-icons");
  await expect(avatars.nth(0).locator("img")).toHaveAttribute("src", "https://cdn.simpleicons.org/nubank");
  await expect(avatars.nth(1)).toHaveAttribute("data-logo-source", "domain-favicon");
  await expect(avatars.nth(1).locator("img")).toHaveAttribute("src", "https://icons.duckduckgo.com/ip3/smartfit.com.br.ico");
});

test("MaisCtrl badge changes to the fixed +Couple space and returns to the dashboard", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  await expect(page.getByRole("button", { name: "Abrir espaço +Couple" })).toContainText("MaisCtrl");
  await page.getByRole("button", { name: "Abrir espaço +Couple" }).click();
  await expect(page.getByTestId("couple-screen")).toBeVisible();
  await expect(page.getByTestId("couple-screen").getByLabel("Espaço +Couple")).toContainText("+Couple");
  await expect(page.getByText("MAISCTRL +COUPLE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "O dinheiro de vocês, no mesmo lugar." })).toBeVisible();
  await expect(page.getByTestId("couple-screen").locator(".mobile-scroll")).toHaveCount(0);

  await page.getByRole("button", { name: "Voltar para MaisCtrl" }).last().click();
  await expect(page.getByTestId("dashboard-screen")).toBeVisible();
  await expect(page.getByTestId("couple-screen")).toHaveCount(0);
});

test("subscription form leaves a gap above the keyboard without scrolling", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Assinaturas", exact: true }).click();
  await page.getByRole("button", { name: "Nova assinatura" }).click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();
  await page.getByLabel("Nome").click();

  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet).toHaveAttribute("data-scrollable", "false");
  await expect(sheet.locator(".sheet-content")).toHaveCSS("overflow-y", "hidden");
  await expect.poll(() => page.locator(".bottom-sheet").evaluate((element) => {
    const keyboard = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]');
    if (!keyboard) return -1;
    const sheetRect = element.getBoundingClientRect();
    const keyboardRect = keyboard.getBoundingClientRect();
    return keyboardRect.top - sheetRect.bottom;
  })).toBeGreaterThanOrEqual(10);

  const sheetScrollTop = await sheet.locator(".sheet-content").evaluate((element) => element.scrollTop);
  expect(sheetScrollTop).toBe(0);
});

test("adding a subscription uses a fixed three-step modal flow", async ({ page }) => {
  await seedLocalSession(page);
  const insertRequests: string[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().method() === "POST" && route.request().url().includes("/subscriptions")) {
      insertRequests.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: "[]",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "[]",
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Assinaturas", exact: true }).click();
  await page.getByRole("button", { name: "Nova assinatura" }).click();
  const flow = page.getByTestId("subscription-add-flow");
  const progress = flow.locator(".subscription-flow-progress");
  await expect(flow).toBeVisible();
  await expect(progress).toHaveAttribute("aria-label", "Etapa 1 de 3");

  await page.locator("#subscription-name").fill("Netflix");
  await page.locator("#subscription-value").fill("29,90");
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(progress).toHaveAttribute("aria-label", "Etapa 2 de 3");

  await page.locator("#subscription-frequency").selectOption("monthly");
  await page.locator("#subscription-payment").selectOption("credit");
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(progress).toHaveAttribute("aria-label", "Etapa 3 de 3");
  await expect(flow).toContainText("Netflix");
  await expect(flow).toContainText("R$ 29,90");

  await page.getByRole("button", { name: "Cadastrar assinatura" }).click();
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0, { timeout: 2_000 });
  expect(insertRequests).toHaveLength(1);
  expect(insertRequests[0]).toContain("Netflix");
});

test("profile photo upload uses the avatars bucket and saves the profile", async ({ page }) => {
  await seedLocalSession(page);
  const uploadRequests: string[] = [];

  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: "Teste local",
          email: "local-test@maisctrl.app",
          phone_number: null,
          avatar_url: "https://wdmkzljxjjjvzofrpeuk.supabase.co/storage/v1/object/public/avatars/avatar.png",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "[]",
    });
  });
  await page.route("**/storage/v1/object/**", async (route) => {
    uploadRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ Key: "avatars/local/avatar.png" }),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Abrir perfil", exact: true }).click();
  await page.getByRole("button", { name: "Editar perfil" }).click();
  await page.getByLabel("Nome completo").fill("Teste local");
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from("local-avatar"),
  });
  await page.getByRole("button", { name: "Salvar perfil" }).click();

  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
  expect(uploadRequests).toHaveLength(1);
  expect(uploadRequests[0]).toContain("/storage/v1/object/avatars/");
});

test("profile photo appears in the dashboard header beside notifications", async ({ page }) => {
  await seedLocalSession(page);
  const avatarUrl = "https://wdmkzljxjjjvzofrpeuk.supabase.co/storage/v1/object/public/avatars/local/avatar.png";
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("/profiles?")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: "Teste local",
          email: "local-test@maisctrl.app",
          phone_number: null,
          avatar_url: avatarUrl,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "[]",
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  const profileButton = page.getByRole("button", { name: "Abrir perfil" });
  await expect(profileButton).toHaveClass(/dashboard-profile-button/);
  await expect(profileButton.locator("img")).toHaveAttribute("src", avatarUrl);
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

test("imports OFX transactions locally and skips duplicates", async ({ page }) => {
  await seedLocalSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: "[]",
  }));
  await page.goto("/");
  await expect(page.getByTestId("dashboard-screen")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Finanças", exact: true }).click();
  await page.getByRole("button", { name: "Importar OFX", exact: true }).click();

  const ofx = `OFXHEADER:100\nDATA:OFXSGML\nCHARSET:1252\n<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><CCACCTFROM><ACCTID>nubank-123</ACCTID></CCACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912000000<TRNAMT>-49.00<FITID>fit-1<MEMO>Cinemark Praiamar</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260911000000<TRNAMT>120.50<FITID>fit-1<MEMO>Estorno</STMTTRN></BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>`;
  await page.locator("input.finance-file-input").setInputFiles({ name: "nubank.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx) });

  await expect(page.getByRole("heading", { name: "Importar extrato" })).toBeVisible();
  await expect(page.getByText("Cinemark Praiamar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar 2 lançamentos" })).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 lançamentos" }).click();
  await expect(page.getByText("2 lançamentos importados.")).toBeVisible();

  await page.getByRole("button", { name: "Importar OFX", exact: true }).click();
  await page.locator("input.finance-file-input").setInputFiles({ name: "nubank.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx) });
  await expect(page.getByRole("button", { name: "Nenhum lançamento novo" })).toBeDisabled();
  await expect(page.getByText("2 lançamentos já existem e não serão duplicados.")).toBeVisible();
});
