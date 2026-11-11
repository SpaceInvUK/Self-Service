// In-browser replacement for server/index.mjs so the app runs from a single
// HTML file opened with a double click. Data lives in this browser only.
import "./shim.js";
import {
  makeWorkbook,
  parseWorkbook,
  demoKnowledge,
} from "../server/workbook.mjs";
import { reply } from "../server/engine.mjs";

const KEY = "cassistai-local-v1";
const defaultSettings = {
  faq: true,
  quotes: true,
  booking: false,
  askOwner: true,
  notifyOwner: true,
  hoursSet: false,
  tz: "America/Sao_Paulo",
  slot: 60,
  gap: 0,
  teamGroup: "cAssist",
  teamTimeout: 120,
  authorized: [],
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
const empty = () => ({
  learned: [],
  users: [],
  companies: [],
  memberships: [],
  knowledge: [],
  imports: [],
  conversations: [],
  messages: [],
  quotes: [],
  usage: [],
  audit: [],
  session: null,
});
let db;
try {
  db = { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
} catch {
  db = empty();
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* memory only */
  }
};

const uid = () =>
  crypto.randomUUID?.() ||
  Math.random().toString(16).slice(2) + Date.now().toString(16);
const now = () => new Date().toISOString();
function hash(s) {
  const str =
    typeof s === "string"
      ? s
      : Array.from(s, (b) => String.fromCharCode(b)).join("");
  let h1 = 0x811c9dc5,
    h2 = 0x1234567;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822507);
  }
  return (
    (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + str.length.toString(16)
  );
}
class HttpError extends Error {
  constructor(m, s = 400, extra) {
    super(m);
    this.status = s;
    this.extra = extra;
  }
}
const fail = (m, s) => {
  throw new HttpError(m, s);
};
const text = (v, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const integer = (v, min, max) => {
  if (!Number.isInteger(v) || v < min || v > max)
    fail(`Informe um número inteiro entre ${min} e ${max}.`);
  return v;
};
function credentials(b) {
  const email = text(b.email, 200).toLowerCase(),
    password = b.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("Informe um e-mail válido.");
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 200
  )
    fail("A senha precisa ter de 10 a 200 caracteres.");
  return { email, password };
}
const audit = (company, actor, action, detail = "") =>
  db.audit.push({
    id: uid(),
    company_id: company,
    actor,
    action,
    detail,
    created: now(),
  });
const activeKnowledge = (cid) => {
  const k = db.knowledge
    .filter((x) => x.company_id === cid)
    .sort((a, b) => b.version - a.version)[0];
  return k ? { ...k, data: JSON.parse(k.data) } : null;
};
const currentUser = () => {
  const u = db.users.find((x) => x.id === db.session);
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null;
};
function addCompany(name, segment, demo = false) {
  const id = uid();
  db.companies.push({
    id,
    name,
    segment,
    description: "",
    number_limit: 1,
    quota: 1000,
    demo: demo ? 1 : 0,
    created: now(),
  });
  if (demo)
    db.knowledge.push({
      id: uid(),
      company_id: id,
      version: 1,
      hash: hash(JSON.stringify(demoKnowledge)),
      data: JSON.stringify(demoKnowledge),
      created: now(),
    });
  return id;
}
function companyAccess(user, cid) {
  const c = db.companies.find((x) => x.id === cid);
  if (
    !c ||
    (user.role !== "admin" &&
      !db.memberships.some(
        (m) => m.user_id === user.id && m.company_id === cid,
      ))
  )
    fail("Empresa não encontrada.", 404);
  return c;
}
const conversation = (cid, id) =>
  db.conversations.find((c) => c.id === id && c.company_id === cid) ||
  fail("Conversa não encontrada.", 404);
function addMessage(c, role, body, state = "sent") {
  const id = uid();
  db.messages.push({
    id,
    conversation_id: c.id,
    company_id: c.company_id,
    role,
    text: body,
    state,
    external_id: null,
    created: now(),
  });
  c.updated = now();
  return id;
}
function processIncoming(c, input) {
  addMessage(c, "customer", input);
  if (c.status !== "BOT_ATIVO") return;
  const k = activeKnowledge(c.company_id),
    context = JSON.parse(c.context);
  let result;
  if (
    context.awaitingAcceptance &&
    /^(sim|aceito|aceitar|pode fechar|confirmo)[.!\s]*$/i.test(input)
  ) {
    const quote = db.quotes
      .filter((x) => x.conversation_id === c.id && x.status === "ENVIADO")
      .sort((a, b) => b.created.localeCompare(a.created))[0];
    if (quote) quote.status = "ACEITO";
    result = {
      text: "Obrigado! Registrei seu aceite. Um atendente vai confirmar os próximos passos. O aceite ainda não representa pagamento ou venda confirmada.",
      handoff: true,
      context: {},
    };
  } else if (!k)
    result = {
      text: "A empresa ainda não publicou seu catálogo. Vou encaminhar sua mensagem a um atendente.",
      handoff: true,
      context: {},
    };
  else result = reply(k.data, input, context);
  if (result.quote) {
    const id = uid();
    db.quotes.push({
      id,
      company_id: c.company_id,
      conversation_id: c.id,
      code: "ORC-" + id.slice(0, 6).toUpperCase(),
      product: result.quote.product,
      quantity: result.quote.quantity,
      total: result.quote.total,
      deposit: result.quote.deposit,
      conditions: result.quote.conditions,
      status: "ENVIADO",
      knowledge_version: k.version,
      created: now(),
    });
  }
  const mid = addMessage(c, "bot", result.text);
  db.usage.push({
    id: uid(),
    company_id: c.company_id,
    conversation_id: c.id,
    message_id: mid,
    kind: "simulation",
    state: "confirmed",
    created: now(),
  });
  c.context = JSON.stringify(result.context || {});
  c.status = result.handoff ? "AGUARDANDO_ATENDENTE" : "BOT_ATIVO";
}

const routes = [];
const on = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp(
    "^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$",
  );
  routes.push({ method, re, keys, handler, ...opts });
};
const C = "/companies/:cid";

on("GET", "/health", () => ({ ok: true }), { open: true });
on(
  "GET",
  "/session",
  () => ({
    user: currentUser(),
    needsSetup: !db.users.length,
    setupTokenRequired: false,
    aiConfigured: false,
  }),
  { open: true },
);
on(
  "POST",
  "/setup",
  ({ body }) => {
    if (db.users.length) fail("A conta administradora já foi criada.", 409);
    const { email, password } = credentials(body),
      name = text(body.name, 100);
    if (!name) fail("Informe seu nome.");
    const id = uid();
    db.users.push({ id, email, name, password: hash(password), role: "admin" });
    const business = text(body.business, 120);
    if (business) addCompany(business, text(body.segment, 100));
    else addCompany("Formato Comunicação Visual", "Comunicação visual", true);
    db.session = id;
    return { ok: true };
  },
  { open: true },
);
on(
  "POST",
  "/login",
  ({ body }) => {
    const u = db.users.find(
      (x) => x.email === text(body.email, 200).toLowerCase(),
    );
    if (!u || u.password !== hash(String(body.password || "")))
      fail("E-mail ou senha incorretos.", 401);
    db.session = u.id;
    return { ok: true };
  },
  { open: true },
);
on("POST", "/logout", () => {
  db.session = null;
  return { ok: true };
});
on("GET", "/companies", ({ user }) =>
  [
    ...(user.role === "admin"
      ? db.companies
      : db.companies.filter((c) =>
          db.memberships.some(
            (m) => m.user_id === user.id && m.company_id === c.id,
          ),
        )),
  ].sort((a, b) => a.created.localeCompare(b.created)),
);
on("POST", "/companies", ({ user, body }) => {
  if (user.role !== "admin") fail("Acesso exclusivo do administrador.", 403);
  const name = text(body.name, 120);
  if (!name) fail("Informe o nome da empresa.");
  const id = addCompany(name, text(body.segment, 100));
  audit(id, user.id, "company.created");
  return { id };
});
on("GET", C + "/state", ({ company }) => {
  const cid = company.id,
    k = activeKnowledge(cid),
    month = now().slice(0, 7);
  const lastMsg = (id) =>
    db.messages.filter((m) => m.conversation_id === id).at(-1)?.text ?? null;
  const usage = {};
  for (const u of db.usage.filter(
    (u) => u.company_id === cid && u.created.slice(0, 7) === month,
  )) {
    const key = u.kind + "|" + u.state;
    usage[key] = usage[key] || { kind: u.kind, state: u.state, count: 0 };
    usage[key].count++;
  }
  return {
    company,
    knowledge: k ? { version: k.version, created: k.created, ...k.data } : null,
    numbers: [],
    conversations: db.conversations
      .filter((c) => c.company_id === cid)
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 300)
      .map((c) => ({ ...c, last_message: lastMsg(c.id) })),
    quotes: db.quotes
      .filter((x) => x.company_id === cid)
      .sort((a, b) => b.created.localeCompare(a.created))
      .slice(0, 500),
    usage: Object.values(usage),
    ai: { calls: 0, input: 0, output: 0, cost: null },
    aiConfigured: false,
    settings: { ...defaultSettings, ...(company.settings || {}) },
    learned: db.learned.filter((l) => l.company_id === cid),
    ownerQuestions: [],
    pendingLearning: [],
    teamGroup: false,
    ownerChannel: false,
    bookings: [],
    google: { configured: false, connected: false },
  };
});
on("PUT", C + "/settings", ({ company, body }) => {
  company.settings = {
    ...defaultSettings,
    ...(company.settings || {}),
    ...body,
  };
  return { ok: true, settings: company.settings };
});
// Offline demo: no AI, so what the owner teaches is kept as plain information.
on("POST", C + "/owner/message", ({ company, body }) => {
  const texto = text(body.text);
  if (!texto) fail("Escreva uma mensagem.");
  db.learned.push({
    id: uid(),
    company_id: company.id,
    kind: "info",
    data: { texto },
    created: now(),
  });
  return {
    ownerReply: "Anotado! (na versão de demonstração o assistente não usa IA)",
    answered: 0,
    learned: [],
  };
});
on("DELETE", C + "/learned/:id", ({ company, params }) => {
  db.learned = db.learned.filter(
    (l) => !(l.id === params.id && l.company_id === company.id),
  );
  return { ok: true };
});
on("PATCH", C, ({ user, company, body }) => {
  if (user.role !== "admin")
    fail("Apenas o administrador pode alterar limites.", 403);
  company.name = text(body.name, 120) || company.name;
  company.segment = text(body.segment, 100);
  company.number_limit = integer(body.number_limit, 1, 100);
  company.quota = integer(body.quota, 0, 10000000);
  audit(company.id, user.id, "company.updated");
  return { ok: true };
});
on("GET", C + "/users", ({ company }) =>
  db.users
    .filter((u) =>
      db.memberships.some(
        (m) => m.user_id === u.id && m.company_id === company.id,
      ),
    )
    .map(({ id, name, email }) => ({ id, name, email })),
);
on("POST", C + "/users", ({ user, company, body }) => {
  if (user.role !== "admin")
    fail("Apenas o administrador pode cadastrar funcionários.", 403);
  const { email, password } = credentials(body),
    name = text(body.name, 100);
  if (!name) fail("Informe o nome.");
  if (db.users.some((u) => u.email === email))
    fail("Já existe uma conta com este e-mail.");
  const id = uid();
  db.users.push({
    id,
    email,
    name,
    password: hash(password),
    role: "employee",
  });
  db.memberships.push({ user_id: id, company_id: company.id });
  return { ok: true };
});
on("POST", C + "/import", async ({ user, company, body }) => {
  if (user.role !== "admin")
    fail("Somente o administrador pode ativar conhecimento.", 403);
  const file = body instanceof FormData ? body.get("file") : null;
  if (
    !file ||
    !file.name.toLowerCase().endsWith(".xlsx") ||
    file.size > 5 * 1024 * 1024
  )
    fail("Selecione um arquivo .xlsx de até 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(bytes.buffer);
  bytes.readUInt32LE = (i) => dv.getUint32(i, true);
  let parsed;
  try {
    parsed = await parseWorkbook(bytes);
  } catch (e) {
    fail("Não foi possível ler a planilha. " + e.message);
  }
  if (parsed.errors.length)
    throw new HttpError("Corrija a planilha antes de importar.", 422, {
      errors: parsed.errors.slice(0, 60),
    });
  const id = uid();
  db.imports = db.imports.filter((x) => x.company_id !== company.id);
  db.imports.push({
    id,
    company_id: company.id,
    hash: hash(bytes),
    data: JSON.stringify(parsed.data),
    created: now(),
  });
  const current = activeKnowledge(company.id);
  return {
    id,
    ...parsed.data,
    previousProducts: current?.data.products.length || 0,
    removed:
      current?.data.products
        .filter((p) => !parsed.data.products.some((n) => n.codigo === p.codigo))
        .map((p) => p.nome) || [],
  };
});
on("POST", C + "/import/:iid/activate", ({ user, company, params }) => {
  if (user.role !== "admin") fail("Acesso não autorizado.", 403);
  const p =
    db.imports.find(
      (x) => x.id === params.iid && x.company_id === company.id,
    ) || fail("Importação não encontrada.", 404);
  const current = activeKnowledge(company.id);
  if (current?.hash === p.hash)
    return { ok: true, version: current.version, unchanged: true };
  const version = (current?.version || 0) + 1;
  db.knowledge.push({
    id: uid(),
    company_id: company.id,
    version,
    hash: p.hash,
    data: p.data,
    created: now(),
  });
  company.demo = 0;
  audit(company.id, user.id, "knowledge.activated", String(version));
  db.imports = db.imports.filter((x) => x.company_id !== company.id);
  return { ok: true, version };
});
on("GET", C + "/knowledge/history", ({ company }) =>
  db.knowledge
    .filter((k) => k.company_id === company.id)
    .sort((a, b) => b.version - a.version)
    .map(({ version, created }) => ({ version, created })),
);
on("POST", C + "/knowledge/restore", ({ user, company, body }) => {
  if (user.role !== "admin") fail("Acesso não autorizado.", 403);
  const v = integer(body.version, 1, 1000000);
  const k =
    db.knowledge.find((x) => x.company_id === company.id && x.version === v) ||
    fail("Versão não encontrada.", 404);
  db.knowledge.push({
    id: uid(),
    company_id: company.id,
    version: activeKnowledge(company.id).version + 1,
    hash: k.hash,
    data: k.data,
    created: now(),
  });
  audit(company.id, user.id, "knowledge.restored", String(v));
  return { ok: true };
});
on("POST", C + "/conversations", ({ company, body }) => {
  const id = uid();
  db.conversations.push({
    id,
    company_id: company.id,
    number_id: null,
    contact: text(body.contact, 100) || "Visitante de teste",
    address: null,
    mode: "simulation",
    status: "BOT_ATIVO",
    context: "{}",
    updated: now(),
  });
  return { id };
});
on("GET", C + "/conversations/:id", ({ company, params }) => {
  const c = conversation(company.id, params.id);
  return {
    ...c,
    messages: db.messages.filter((m) => m.conversation_id === c.id),
  };
});
on("POST", C + "/conversations/:id/message", ({ company, params, body }) => {
  const c = conversation(company.id, params.id),
    t = text(body.text);
  if (!t) fail("Digite uma mensagem.");
  if (body.role === "customer") processIncoming(c, t);
  else {
    if (c.status === "BOT_ATIVO")
      fail("Assuma o atendimento antes de responder.");
    addMessage(c, "human", t);
  }
  return { ok: true };
});
on(
  "POST",
  C + "/conversations/:id/status",
  ({ user, company, params, body }) => {
    const c = conversation(company.id, params.id);
    if (
      !["BOT_ATIVO", "EM_ATENDIMENTO_HUMANO", "ENCERRADA"].includes(body.status)
    )
      fail("Estado inválido.");
    Object.assign(c, { status: body.status, context: "{}", updated: now() });
    audit(c.company_id, user.id, "conversation.status", body.status);
    return { ok: true };
  },
);
on("POST", C + "/quotes/:id/status", ({ user, company, params, body }) => {
  const quote =
    db.quotes.find((x) => x.id === params.id && x.company_id === company.id) ||
    fail("Orçamento não encontrado.", 404);
  const transitions = {
    ENVIADO: ["ACEITO", "PERDIDO", "CANCELADO"],
    ACEITO: ["VENDA_CONFIRMADA", "PERDIDO", "CANCELADO"],
  };
  if (!transitions[quote.status]?.includes(body.status))
    fail("Transição de orçamento inválida.");
  quote.status = body.status;
  audit(company.id, user.id, "quote.status", `${quote.code}: ${body.status}`);
  return { ok: true };
});
const whatsappOnly = () =>
  fail(
    "A conexão com o WhatsApp precisa da versão com servidor. Nesta versão de arquivo único, use o simulador.",
  );
on("POST", C + "/numbers", whatsappOnly);
on("GET", C + "/numbers/:id/qr", whatsappOnly);
on("DELETE", C + "/numbers/:id", () => ({ ok: true }));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function handle(path, init) {
  const method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (typeof body === "string")
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  body ||= {};
  for (const r of routes) {
    const m = r.method === method && path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(
      r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]),
    );
    try {
      const user = currentUser();
      if (!r.open && !user)
        return json({ error: "Faça login para continuar." }, 401);
      const company = params.cid ? companyAccess(user, params.cid) : undefined;
      const out = await r.handler({ user, company, params, body });
      save();
      return json(out);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      return json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "Não foi possível concluir a operação.",
          ...(e.extra || {}),
        },
        e.status || 500,
      );
    }
  }
  return json({ error: "Rota não encontrada." }, 404);
}

const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("/api/")) {
    const path = url.slice(4).split("?")[0];
    return handle(path, init);
  }
  return realFetch(input, init);
};

// Spreadsheet template links point at /api/template; build the file here instead.
document.addEventListener(
  "click",
  async (ev) => {
    const a = ev.target.closest?.("a[href^='/api/template']");
    if (!a) return;
    ev.preventDefault();
    const sample = a.getAttribute("href").includes("sample=1");
    const data = await makeWorkbook(sample);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    link.download = sample
      ? "cAssistAI-Formato-exemplo.xlsx"
      : "cAssistAI-modelo.xlsx";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  },
  true,
);
