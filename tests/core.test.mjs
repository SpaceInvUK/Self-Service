import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  demoKnowledge,
  makeWorkbook,
  parseWorkbook,
} from "../server/workbook.mjs";
import { calculate, reply } from "../server/engine.mjs";
test("wind banner kit uses its own price: two units, 50% deposit", () => {
  assert.deepEqual(calculate(demoKnowledge.products[1], 2), {
    total: 56000,
    deposit: 28000,
  });
});
test("area pricing, quantity and minimum use explicit dimensions", () => {
  const p = { preco: 79.9, unidade: "M2", entrada: null, minimo: 100 };
  assert.deepEqual(calculate(p, 2, 1.5, 0.8), { total: 19176, deposit: null });
  assert.equal(calculate(p, 1, 0.1, 0.1).total, 10000);
  assert.throws(() => calculate(p, 0, 1, 1));
  assert.throws(() => calculate(p, 1, -1, 1));
});
test("multi-turn bot collects quantity and creates a quote", () => {
  const first = reply(demoKnowledge, "WB-200");
  assert.equal(first.context.product, "WB-200");
  const second = reply(demoKnowledge, "2 unidades", first.context);
  assert.equal(second.quote.total, 56000);
  assert.equal(second.quote.deposit, 28000);
});
test("dimensions identify the variant rather than becoming a quantity", () => {
  const result = reply(demoKnowledge, "Quero wind banner 2 x 0,75");
  assert.equal(result.context.product, "WB-200");
  assert.equal(result.quote, undefined);
});
test("unknown answers and explicit human requests hand off", () => {
  assert.equal(reply(demoKnowledge, "quero um atendente").handoff, true);
  assert.equal(
    reply(demoKnowledge, "Qual a certificação do material?").handoff,
    true,
  );
});
test("sample workbook round-trips without changing prices", async () => {
  const parsed = await parseWorkbook(await makeWorkbook(true));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.products[1].preco, 280);
  assert.equal(parsed.data.products[1].entrada, 50);
});
test("import rejects formulas, duplicate codes and malformed prices", async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await makeWorkbook(true));
  const s = w.getWorksheet("PRODUTOS");
  s.getCell("A3").value = s.getCell("A2").value;
  s.getCell("E2").value = { formula: "1+1", result: 2 };
  s.getCell("E4").value = "não sei";
  const parsed = await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));
  assert.ok(parsed.errors.some((e) => e.includes("fórmula")));
  assert.ok(parsed.errors.some((e) => e.includes("duplicado")));
  assert.ok(parsed.errors.some((e) => e.includes("preço")));
});
test("template refuses activation until company filled; non-ZIP rejected", async () => {
  assert.ok((await parseWorkbook(await makeWorkbook())).errors.length);
  await assert.rejects(() => parseWorkbook(Buffer.from("not excel")));
});
test("greetings and small talk are answered, not handed off", () => {
  for (const m of [
    "oi",
    "Oi, tudo bem?",
    "bom dia tudo bem",
    "tudo bem?",
    "e aí, beleza?",
  ]) {
    const r = reply(demoKnowledge, m);
    assert.equal(r.smalltalk, true, m);
    assert.notEqual(r.handoff, true, m);
  }
  assert.equal(reply(demoKnowledge, "obrigado!").smalltalk, true);
});
test("refunds, complaints and discounts always go to a person", () => {
  for (const m of [
    "quero meu dinheiro de volta",
    "quero cancelar o pedido",
    "o produto veio com defeito",
    "consegue um desconto?",
    "quero falar com uma pessoa",
  ])
    assert.equal(reply(demoKnowledge, m).handoff, true, m);
});
test("import accepts links, formatted text and renamed-case headers", async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await makeWorkbook(true));
  const e = w.getWorksheet("EMPRESA");
  e.getCell("A1").value = "Nome";
  e.getCell("A2").value = {
    richText: [{ text: "Padaria " }, { font: { bold: true }, text: "Pão Bom" }],
  };
  e.getCell("C2").value = {
    text: "contato@padaria.com",
    hyperlink: "mailto:contato@padaria.com",
  };
  const parsed = await parseWorkbook(Buffer.from(await w.xlsx.writeBuffer()));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.company.nome, "Padaria Pão Bom");
  assert.equal(parsed.data.company.descricao, "contato@padaria.com");
});
test("empty company name gives a clear message", async () => {
  const parsed = await parseWorkbook(await makeWorkbook(false));
  assert.ok(parsed.errors.some((e) => e.includes("linha 2")));
});
test("business hours: open status, next opening and free slots", async () => {
  const { openStatus, freeSlots, slotLabel } =
    await import("../server/hours.mjs");
  const s = {
    hoursSet: true,
    tz: "America/Sao_Paulo",
    slot: 60,
    days: {
      0: null,
      1: ["08:00", "18:00"],
      2: ["08:00", "18:00"],
      3: ["08:00", "18:00"],
      4: ["08:00", "18:00"],
      5: ["08:00", "18:00"],
      6: ["08:00", "12:00"],
    },
  };
  // Tuesday 20:30 in São Paulo (UTC-3).
  const night = new Date("2026-11-10T23:30:00Z");
  assert.deepEqual(openStatus(s, night), {
    open: false,
    opens: "amanhã às 08:00",
  });
  assert.equal(openStatus(s, new Date("2026-11-10T15:00:00Z")).open, true);
  assert.equal(
    openStatus(s, new Date("2026-11-14T16:00:00Z")).opens,
    "segunda às 08:00",
  );
  const busy = [{ start: "2026-11-11T12:00:00Z", end: "2026-11-11T13:00:00Z" }];
  const slots = freeSlots(s, busy, night, 2, 3).map((x) =>
    slotLabel(x.start, s.tz),
  );
  assert.deepEqual(slots, [
    "qua 11/11 às 08:00",
    "qua 11/11 às 10:00",
    "qua 11/11 às 11:00",
  ]);
  assert.equal(openStatus({ ...s, hoursSet: false }, night), null);
});
test("quotes show the calculation and respect the minimum", async () => {
  const { quoteFor } = await import("../server/engine.mjs");
  const lona = {
    codigo: "L1",
    nome: "Lona",
    preco: 10,
    unidade: "M2",
    minimo: 0,
    entrada: null,
    prazo: "",
  };
  const plain = (t) => t.replace(/\u00a0/g, " ");
  const r = quoteFor({ conditions: [] }, lona, 1, 2, 1);
  assert.equal(r.quote.total, 2000);
  assert.ok(plain(r.text).includes("2 m² × R$ 10,00/m² = R$ 20,00"));
  const min = quoteFor({ conditions: [] }, { ...lona, minimo: 50 }, 1, 1, 1);
  assert.equal(min.quote.total, 5000);
  assert.ok(
    plain(min.text).includes("= R$ 10,00\nValor mínimo aplicado: R$ 50,00"),
  );
});
test("closing an order goes to a person; hours rule is not triggered by 'fechar'", () => {
  assert.equal(reply(demoKnowledge, "quero fechar o pedido").handoff, true);
  const k = structuredClone(demoKnowledge);
  k.company.horario = "Seg a sex, 8h às 18h";
  assert.equal(reply(k, "que horas vocês abrem?").text, k.company.horario);
  assert.notEqual(
    reply(k, "vocês fecham a loja no feriado?").text,
    k.company.horario,
  );
});
test("team settings: group names and validation", async () => {
  const { settingsFor, cleanSettings, teamGroupNames } =
    await import("../server/assistant.mjs");
  const s = settingsFor({ settings: "{}" });
  assert.equal(s.teamTimeout, 120);
  assert.deepEqual(teamGroupNames(s), ["cassist", "kassist"]);
  assert.deepEqual(teamGroupNames({ teamGroup: "Equipe Loja" }), [
    "equipeloja",
  ]);
  const next = cleanSettings(
    { authorized: ["+55 (11) 98765-4321", "123"], teamTimeout: 300 },
    s,
  );
  assert.deepEqual(next.authorized, ["5511987654321"]);
  assert.throws(() => cleanSettings({ teamTimeout: 5 }, s));
});
