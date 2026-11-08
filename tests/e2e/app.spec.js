import { test, expect } from "@playwright/test";
import { makeWorkbook } from "../../server/workbook.mjs";
test("complete workflow: setup, Excel import, quote, handoff, sale, quotas and tenant isolation", async ({
  page,
  request,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Seu nome", { exact: true }).fill("Teste Admin");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("TestingPassword123!");
  await page.getByRole("button", { name: "Criar minha central" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Teste." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Conhecimento", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "empresa.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await makeWorkbook(true),
    });
  await expect(
    page.getByRole("heading", { name: "Revise sua nova base" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e ativar base" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Atendimentos", exact: true }).click();
  await page.getByRole("button", { name: "Nova simulação" }).click();
  const message = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await message.fill("Quero 2 unidades WB-200");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.locator(".message.bot").last()).toContainText("560,00");
  await expect(page.locator(".message.bot").last()).toContainText("280,00");
  await message.fill("sim");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.locator(".chat-notice")).toBeVisible();
  await page.getByRole("button", { name: "Assumir", exact: true }).click();
  await message.fill("Olá! Vou confirmar os detalhes da produção.");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.locator(".message.human")).toContainText("produção");
  await page.getByRole("button", { name: "Orçamentos", exact: true }).click();
  await page.getByRole("button", { name: "Detalhes", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar venda", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Venda confirmada", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova empresa", exact: true }).click();
  await page
    .getByLabel("Nome da empresa", { exact: true })
    .last()
    .fill("Outra Empresa");
  await page
    .getByRole("button", { name: "Criar empresa", exact: true })
    .click();
  await expect(page.getByLabel("Empresa ativa")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Conhecimento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sua base está esperando por você" }),
  ).toBeVisible();
  const companies = await page.request
      .get("/api/companies")
      .then((r) => r.json()),
    first = companies.find((c) => c.name.includes("Formato")),
    second = companies.find((c) => c.name === "Outra Empresa");
  expect(
    (
      await page.request.post(`/api/companies/${second.id}/users`, {
        data: {
          name: "Atendente",
          email: "staff@example.test",
          password: "StaffPassword123!",
        },
      })
    ).ok(),
  ).toBeTruthy();
  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await staffPage.request.post("http://127.0.0.1:3100/api/login", {
    data: { email: "staff@example.test", password: "StaffPassword123!" },
  });
  expect(
    (
      await staffPage.request.get(
        `http://127.0.0.1:3100/api/companies/${first.id}/state`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await staffPage.request.patch(
        `http://127.0.0.1:3100/api/companies/${second.id}`,
        {
          data: { name: "Hack", segment: "", number_limit: 100, quota: 100000 },
        },
      )
    ).status(),
  ).toBe(403);
  await staff.close();
  const numbers = await Promise.all(
    [1, 2].map((i) =>
      page.request.post(`/api/companies/${second.id}/numbers`, {
        data: { label: "Número " + i },
      }),
    ),
  );
  expect(numbers.filter((r) => r.ok())).toHaveLength(1);
  expect(numbers.filter((r) => r.status() === 400)).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('aside.sidebar')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.locator('aside.sidebar')).toBeInViewport();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await expect(page.locator('aside.sidebar')).not.toBeInViewport();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("connector protocol: token scope, duplicate delivery, quota reservation, handoff and revocation", async ({
  request,
}) => {
  await request.post("/api/login", {
    data: { email: "admin@example.test", password: "TestingPassword123!" },
  });
  const companies = await request.get("/api/companies").then((r) => r.json());
  const company = companies.find((c) => c.name.includes("Formato"));
  await request.patch(`/api/companies/${company.id}`, {
    data: {
      name: company.name,
      segment: company.segment,
      number_limit: 1,
      quota: 1,
    },
  });
  const conn = await request
    .post(`/api/companies/${company.id}/numbers`, {
      data: { label: "Conector de teste" },
    })
    .then((r) => r.json());
  const headers = { Authorization: `Bearer ${conn.token}` };
  expect(
    (
      await request.post("/api/connector/heartbeat", {
        headers,
        data: { status: "online", phone: "5500000000000" },
      })
    ).ok(),
  ).toBeTruthy();
  const incoming = {
    id: "test-inbound-1",
    address: "5500111111111@s.whatsapp.net",
    name: "Cliente do protocolo",
    text: "Quero 2 unidades WB-200",
  };
  expect(
    (
      await request.post("/api/connector/incoming", { headers, data: incoming })
    ).ok(),
  ).toBeTruthy();
  const duplicate = await request
    .post("/api/connector/incoming", { headers, data: incoming })
    .then((r) => r.json());
  expect(duplicate.duplicate).toBeTruthy();
  const outbox = await request
    .get("/api/connector/outbox", { headers })
    .then((r) => r.json());
  expect(outbox).toHaveLength(1);
  expect(outbox[0].text).toContain("560,00");
  expect(
    await request
      .get("/api/connector/outbox", { headers })
      .then((r) => r.json()),
  ).toHaveLength(0);
  await request.post("/api/connector/ack", {
    headers,
    data: { id: outbox[0].id, ok: true },
  });
  await request.post("/api/connector/ack", {
    headers,
    data: { id: outbox[0].id, ok: true },
  });
  await request.post("/api/connector/incoming", {
    headers,
    data: { ...incoming, id: "test-inbound-2", text: "Olá" },
  });
  const state = await request
    .get(`/api/companies/${company.id}/state`)
    .then((r) => r.json());
  expect(
    state.usage.find((u) => u.kind === "bot" && u.state === "confirmed").count,
  ).toBe(1);
  const conversation = state.conversations.find(
    (c) => c.contact === "Cliente do protocolo",
  );
  expect(conversation.status).toBe("AGUARDANDO_ATENDENTE");
  expect(
    await request
      .get("/api/connector/outbox", { headers })
      .then((r) => r.json()),
  ).toHaveLength(0);
  await request.post(
    `/api/companies/${company.id}/conversations/${conversation.id}/status`,
    { data: { status: "EM_ATENDIMENTO_HUMANO" } },
  );
  await request.post(
    `/api/companies/${company.id}/conversations/${conversation.id}/message`,
    {
      data: {
        role: "human",
        text: "Atendimento humano continua sem franquia de bot.",
      },
    },
  );
  const human = await request
    .get("/api/connector/outbox", { headers })
    .then((r) => r.json());
  expect(human).toHaveLength(1);
  await request.post("/api/connector/ack", {
    headers,
    data: { id: human[0].id, ok: true },
  });
  expect(
    (
      await request
        .get(`/api/companies/${company.id}/state`)
        .then((r) => r.json())
    ).usage.find((u) => u.kind === "bot" && u.state === "confirmed").count,
  ).toBe(1);
  await request.delete(`/api/companies/${company.id}/numbers/${conn.id}`);
  expect(
    (await request.get("/api/connector/outbox", { headers })).status(),
  ).toBe(401);
});
