import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import {
  openDB,
  uid,
  now,
  hash,
  q,
  one,
  run,
  transaction,
  audit,
  activeKnowledge,
} from "./db.mjs";
import { makeWorkbook, parseWorkbook, demoKnowledge } from "./workbook.mjs";
import { reply } from "./engine.mjs";
import { aiReady, aiBase } from "./ai.mjs";
import {
  settingsFor,
  cleanSettings,
  knowledgeFor,
  learnedFor,
  addMessage as addMsg,
  sendBot,
  sendToOwner,
  notifyOwnerHandoff,
  pendingQuestions,
  handleOwnerMessage,
  customerTurn,
  applyTurn,
} from "./assistant.mjs";
import {
  googleConfigured,
  authUrl as googleAuthUrl,
  exchangeCode as googleExchange,
} from "./google.mjs";
import {
  localConnectorsEnabled,
  startLocalConnector,
  stopLocalConnector,
  resumeLocalConnectors,
} from "./local-connectors.mjs";

export const db = openDB();
const app = express();
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const localCentral = `http://${["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host}:${port}`;
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
          },
        }
      : false,
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res.status(403).json({ error: "Origem não autorizada." });
    } catch {
      return res.status(403).json({ error: "Origem inválida." });
    }
  }
  next();
});
const fail = (msg, status = 400) => {
  const e = Error(msg);
  e.status = status;
  throw e;
};
const text = (v, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
function integer(v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max)
    fail(`Informe um número inteiro entre ${min} e ${max}.`);
  return v;
}
const protectPassword = (p) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
};
const verifyPassword = (p, stored) => {
  const [salt, h] = stored.split(":");
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(h, "hex"));
};
function credentials(body) {
  const email = text(body.email, 200).toLowerCase(),
    password = body.password;
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
function login(res, id) {
  const token = randomBytes(32).toString("hex");
  run(
    db,
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    id,
    Date.now() + 7 * 86400000,
  );
  res.cookie("cassist_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
function userFrom(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("cassist_session="))
    ?.split("=")[1];
  return token
    ? one(
        db,
        "SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        hash(token),
        Date.now(),
      )
    : null;
}
const auth = (req, res, next) => {
  req.user = userFrom(req);
  if (!req.user)
    return res.status(401).json({ error: "Faça login para continuar." });
  next();
};
const admin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res
      .status(403)
      .json({ error: "Acesso exclusivo do administrador." });
  next();
};
function companyAccess(req, cid) {
  const c = one(db, "SELECT * FROM companies WHERE id=?", cid);
  if (
    !c ||
    (req.user.role !== "admin" &&
      !one(
        db,
        "SELECT 1 FROM memberships WHERE user_id=? AND company_id=?",
        req.user.id,
        cid,
      ))
  )
    fail("Empresa não encontrada.", 404);
  return c;
}
function addCompany(name, segment, demo = false) {
  const id = uid();
  run(
    db,
    "INSERT INTO companies(id,name,segment,demo,created) VALUES(?,?,?,?,?)",
    id,
    name,
    segment,
    demo ? 1 : 0,
    now(),
  );
  if (demo)
    run(
      db,
      "INSERT INTO knowledge VALUES(?,?,?,?,?,?)",
      uid(),
      id,
      1,
      hash(JSON.stringify(demoKnowledge)),
      JSON.stringify(demoKnowledge),
      now(),
    );
  return id;
}
const authLimiter = rateLimit({
  windowMs: 15 * 60000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
});
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/session", (req, res) =>
  res.json({
    user: userFrom(req),
    needsSetup: !one(db, "SELECT 1 FROM users LIMIT 1"),
    setupTokenRequired: !["127.0.0.1", "localhost", "::1"].includes(host),
    aiConfigured: aiReady(),
    localConnectors: localConnectorsEnabled,
  }),
);
app.post("/api/setup", authLimiter, (req, res) => {
  if (one(db, "SELECT 1 FROM users LIMIT 1"))
    fail("A conta administradora já foi criada.", 409);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) &&
    (!process.env.SETUP_TOKEN ||
      req.body.setupToken !== process.env.SETUP_TOKEN)
  )
    fail("Informe o token de instalação configurado no servidor.", 403);
  const { email, password } = credentials(req.body),
    name = text(req.body.name, 100);
  if (!name) fail("Informe seu nome.");
  const id = uid();
  transaction(db, () => {
    run(
      db,
      "INSERT INTO users VALUES(?,?,?,?,?)",
      id,
      email,
      name,
      protectPassword(password),
      "admin",
    );
    // The owner's own business; the Formato demo only when asked for.
    const business = text(req.body.business, 120);
    if (business) addCompany(business, text(req.body.segment, 100));
    else addCompany("Formato Comunicação Visual", "Comunicação visual", true);
  });
  login(res, id);
  res.json({ ok: true });
});
app.post("/api/login", authLimiter, (req, res) => {
  const email = text(req.body.email, 200).toLowerCase(),
    password = typeof req.body.password === "string" ? req.body.password : "";
  const u = one(db, "SELECT * FROM users WHERE email=?", email);
  if (password.length > 200 || !u || !verifyPassword(password, u.password))
    fail("E-mail ou senha incorretos.", 401);
  login(res, u.id);
  res.json({ ok: true });
});
app.post("/api/logout", auth, (req, res) => {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("cassist_session="))
    ?.split("=")[1];
  if (token) run(db, "DELETE FROM sessions WHERE token=?", hash(token));
  res.clearCookie("cassist_session", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/companies", auth, (req, res) =>
  res.json(
    req.user.role === "admin"
      ? q(db, "SELECT * FROM companies ORDER BY created")
      : q(
          db,
          "SELECT c.* FROM companies c JOIN memberships m ON m.company_id=c.id WHERE m.user_id=? ORDER BY created",
          req.user.id,
        ),
  ),
);
app.post("/api/companies", auth, admin, (req, res) => {
  const name = text(req.body.name, 120);
  if (!name) fail("Informe o nome da empresa.");
  const id = addCompany(name, text(req.body.segment, 100));
  audit(db, id, req.user.id, "company.created");
  res.json({ id });
});
app.use("/api/companies/:cid", (req, res, next) =>
  auth(req, res, () => {
    req.company = companyAccess(req, req.params.cid);
    next();
  }),
);
const base = "/api/companies/:cid";
app.get(base + "/state", (req, res) => {
  const cid = req.company.id,
    k = activeKnowledge(db, cid),
    month = now().slice(0, 7);
  const numbers = q(
    db,
    "SELECT id,label,phone,status,heartbeat,created FROM numbers WHERE company_id=?",
    cid,
  ).map((n) => ({
    ...n,
    status:
      n.heartbeat && Date.now() - Date.parse(n.heartbeat) < 45000
        ? n.status
        : "offline",
  }));
  const conversations = q(
    db,
    `SELECT c.*, (SELECT text FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created DESC,rowid DESC LIMIT 1) last_message FROM conversations c WHERE c.company_id=? AND c.mode<>'owner' ORDER BY c.updated DESC LIMIT 300`,
    cid,
  );
  const quotes = q(
    db,
    "SELECT * FROM quotes WHERE company_id=? ORDER BY created DESC LIMIT 500",
    cid,
  );
  const usage = q(
    db,
    "SELECT kind,state,COUNT(*) count FROM usage WHERE company_id=? AND substr(created,1,7)=? GROUP BY kind,state",
    cid,
    month,
  );
  const ai = one(
    db,
    "SELECT COUNT(*) calls,COALESCE(SUM(input_tokens),0) input,COALESCE(SUM(output_tokens),0) output,SUM(cost) cost FROM ai_usage WHERE company_id=? AND substr(created,1,7)=?",
    cid,
    month,
  );
  const { settings: _raw, ...company } = req.company;
  res.json({
    company,
    settings: settingsFor(req.company),
    learned: learnedFor(db, cid),
    ownerQuestions: pendingQuestions(db, cid),
    ownerChannel: Boolean(
      one(db, "SELECT 1 FROM numbers WHERE company_id=? AND phone<>''", cid),
    ),
    bookings: q(
      db,
      "SELECT * FROM bookings WHERE company_id=? AND end>? ORDER BY start LIMIT 200",
      cid,
      new Date(Date.now() - 86400000).toISOString(),
    ),
    google: {
      configured: googleConfigured(),
      connected: Boolean(
        one(db, "SELECT 1 FROM google_accounts WHERE company_id=?", cid),
      ),
    },
    knowledge: k ? { version: k.version, created: k.created, ...k.data } : null,
    numbers,
    conversations,
    quotes,
    usage,
    ai,
    aiConfigured: aiReady(),
    localConnectors: localConnectorsEnabled,
  });
});
app.patch(base, (req, res) => {
  if (req.user.role !== "admin")
    fail("Apenas o administrador pode alterar limites.", 403);
  const name = text(req.body.name, 120) || req.company.name,
    segment = text(req.body.segment, 100),
    limit = integer(req.body.number_limit, 1, 100),
    quota = integer(req.body.quota, 0, 10000000);
  if (
    one(db, "SELECT COUNT(*) n FROM numbers WHERE company_id=?", req.company.id)
      .n > limit
  )
    fail("Desconecte e remova números antes de reduzir o limite.");
  run(
    db,
    "UPDATE companies SET name=?,segment=?,number_limit=?,quota=? WHERE id=?",
    name,
    segment,
    limit,
    quota,
    req.company.id,
  );
  audit(db, req.company.id, req.user.id, "company.updated");
  res.json({ ok: true });
});
app.put(base + "/settings", (req, res) => {
  if (req.user.role !== "admin")
    fail("Apenas o administrador altera o atendimento.", 403);
  let next;
  try {
    next = cleanSettings(req.body || {}, settingsFor(req.company));
  } catch (e) {
    fail(e.message);
  }
  run(
    db,
    "UPDATE companies SET settings=? WHERE id=?",
    JSON.stringify(next),
    req.company.id,
  );
  audit(db, req.company.id, req.user.id, "settings.updated");
  res.json({ ok: true, settings: next });
});
// The owner answers the assistant or teaches it from the panel (the same
// happens in the "message yourself" chat on WhatsApp).
app.post(base + "/owner/message", async (req, res) => {
  const body = text(req.body.text);
  if (!body) fail("Escreva uma mensagem.");
  const r = await serialized("owner:" + req.company.id, () =>
    handleOwnerMessage(db, req.company, body),
  );
  res.json(r);
});
app.delete(base + "/learned/:id", (req, res) => {
  run(
    db,
    "DELETE FROM learned WHERE id=? AND company_id=?",
    req.params.id,
    req.company.id,
  );
  res.json({ ok: true });
});
app.post(base + "/bookings/:id/status", (req, res) => {
  if (!["CONFIRMADO", "CANCELADO"].includes(req.body.status))
    fail("Estado inválido.");
  const r = run(
    db,
    "UPDATE bookings SET status=? WHERE id=? AND company_id=?",
    req.body.status,
    req.params.id,
    req.company.id,
  );
  if (!r.changes) fail("Agendamento não encontrado.", 404);
  audit(db, req.company.id, req.user.id, "booking.status", req.body.status);
  res.json({ ok: true });
});
// Google Calendar: OAuth with a loopback redirect to this computer.
const googleStates = new Map();
const googleRedirect = () => `${localCentral}/api/google/callback`;
app.get(base + "/google/connect", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  if (!googleConfigured())
    fail(
      "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env (veja o README).",
    );
  const state = randomBytes(24).toString("hex");
  googleStates.set(state, { cid: req.company.id, at: Date.now() });
  res.json({ url: googleAuthUrl(googleRedirect(), state) });
});
app.delete(base + "/google", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  run(db, "DELETE FROM google_accounts WHERE company_id=?", req.company.id);
  res.json({ ok: true });
});
app.get("/api/google/callback", async (req, res) => {
  const pending = googleStates.get(String(req.query.state || ""));
  googleStates.delete(String(req.query.state || ""));
  const back = (msg) => res.redirect("/?google=" + encodeURIComponent(msg));
  if (!pending || Date.now() - pending.at > 10 * 60000)
    return back("Conexão expirada. Tente de novo.");
  if (!req.query.code) return back("Conexão com o Google cancelada.");
  try {
    const t = await googleExchange(String(req.query.code), googleRedirect());
    if (!t.refresh_token)
      return back("O Google não liberou acesso contínuo. Tente de novo.");
    run(
      db,
      "INSERT INTO google_accounts(company_id,refresh_token,created) VALUES(?,?,?) ON CONFLICT(company_id) DO UPDATE SET refresh_token=excluded.refresh_token,created=excluded.created",
      pending.cid,
      t.refresh_token,
      now(),
    );
    back("ok");
  } catch (e) {
    back(e.message);
  }
});
app.get(base + "/users", (req, res) =>
  res.json(
    q(
      db,
      "SELECT u.id,u.name,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.company_id=?",
      req.company.id,
    ),
  ),
);
app.post(base + "/users", (req, res) => {
  if (req.user.role !== "admin")
    fail("Apenas o administrador pode cadastrar funcionários.", 403);
  const { email, password } = credentials(req.body),
    name = text(req.body.name, 100);
  if (!name) fail("Informe o nome.");
  if (one(db, "SELECT 1 FROM users WHERE email=?", email))
    fail("Já existe uma conta com este e-mail.");
  transaction(db, () => {
    const id = uid();
    run(
      db,
      "INSERT INTO users VALUES(?,?,?,?,?)",
      id,
      email,
      name,
      protectPassword(password),
      "employee",
    );
    run(db, "INSERT INTO memberships VALUES(?,?)", id, req.company.id);
  });
  res.json({ ok: true });
});
app.get("/api/template", auth, async (req, res) => {
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.attachment(
    req.query.sample === "1"
      ? "cAssistAI-Formato-exemplo.xlsx"
      : "cAssistAI-modelo.xlsx",
  );
  res.send(await makeWorkbook(req.query.sample === "1"));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.post(base + "/import", upload.single("file"), async (req, res) => {
  if (req.user.role !== "admin")
    fail("Somente o administrador pode ativar conhecimento.", 403);
  if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx"))
    fail("Selecione um arquivo .xlsx de até 5 MB.");
  let parsed;
  try {
    parsed = await parseWorkbook(req.file.buffer);
  } catch (e) {
    fail("Não foi possível ler a planilha. " + e.message);
  }
  if (parsed.errors.length)
    return res.status(422).json({
      error: "Corrija a planilha antes de importar.",
      errors: parsed.errors.slice(0, 60),
    });
  const id = uid(),
    digest = hash(req.file.buffer);
  run(
    db,
    "INSERT INTO imports VALUES(?,?,?,?,?)",
    id,
    req.company.id,
    digest,
    JSON.stringify(parsed.data),
    now(),
  );
  const current = activeKnowledge(db, req.company.id);
  res.json({
    id,
    ...parsed.data,
    previousProducts: current?.data.products.length || 0,
    removed:
      current?.data.products
        .filter((p) => !parsed.data.products.some((n) => n.codigo === p.codigo))
        .map((p) => p.nome) || [],
  });
});
app.post(base + "/import/:iid/activate", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  const cid = req.company.id,
    p = one(
      db,
      "SELECT * FROM imports WHERE id=? AND company_id=?",
      req.params.iid,
      cid,
    );
  if (!p) fail("Importação não encontrada.", 404);
  const current = activeKnowledge(db, cid);
  if (current?.hash === p.hash)
    return res.json({ ok: true, version: current.version, unchanged: true });
  const version = (current?.version || 0) + 1;
  transaction(db, () => {
    run(
      db,
      "INSERT INTO knowledge VALUES(?,?,?,?,?,?)",
      uid(),
      cid,
      version,
      p.hash,
      p.data,
      now(),
    );
    run(db, "UPDATE companies SET demo=0 WHERE id=?", cid);
    audit(db, cid, req.user.id, "knowledge.activated", String(version));
    run(db, "DELETE FROM imports WHERE company_id=?", cid);
  });
  res.json({ ok: true, version });
});
app.get(base + "/knowledge/history", (req, res) =>
  res.json(
    q(
      db,
      "SELECT version,created FROM knowledge WHERE company_id=? ORDER BY version DESC",
      req.company.id,
    ),
  ),
);
app.post(base + "/knowledge/restore", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  const k = one(
    db,
    "SELECT * FROM knowledge WHERE company_id=? AND version=?",
    req.company.id,
    integer(req.body.version, 1, 1000000),
  );
  if (!k) fail("Versão não encontrada.", 404);
  const version = activeKnowledge(db, req.company.id).version + 1;
  run(
    db,
    "INSERT INTO knowledge VALUES(?,?,?,?,?,?)",
    uid(),
    req.company.id,
    version,
    k.hash,
    k.data,
    now(),
  );
  audit(
    db,
    req.company.id,
    req.user.id,
    "knowledge.restored",
    String(k.version),
  );
  res.json({ ok: true });
});
app.post(base + "/conversations", (req, res) => {
  const id = uid(),
    cid = req.company.id;
  // Only one simulation at a time: a new test replaces the previous one, with
  // its messages and test quotes, so tests do not pile up next to real chats.
  transaction(db, () => {
    const old =
      "SELECT id FROM conversations WHERE company_id=? AND mode='simulation'";
    for (const table of [
      "usage",
      "quotes",
      "messages",
      "owner_questions",
      "bookings",
    ])
      run(db, `DELETE FROM ${table} WHERE conversation_id IN (${old})`, cid);
    run(
      db,
      "DELETE FROM conversations WHERE company_id=? AND mode='simulation'",
      cid,
    );
    run(
      db,
      "INSERT INTO conversations(id,company_id,contact,updated) VALUES(?,?,?,?)",
      id,
      cid,
      text(req.body.contact, 100) || "Visitante de teste",
      now(),
    );
  });
  res.json({ id });
});
function conversation(cid, id) {
  const c = one(
    db,
    "SELECT * FROM conversations WHERE id=? AND company_id=?",
    id,
    cid,
  );
  if (!c) fail("Conversa não encontrada.", 404);
  return c;
}
const addMessage = (c, role, body, state = "sent") =>
  addMsg(db, c, role, body, state);
const locks = new Map();
async function serialized(id, fn) {
  const previous = locks.get(id) || Promise.resolve();
  const task = previous.catch(() => {}).then(fn);
  locks.set(id, task);
  try {
    return await task;
  } finally {
    if (locks.get(id) === task) locks.delete(id);
  }
}
async function processIncoming(c, input) {
  addMessage(c, "customer", input);
  if (c.status !== "BOT_ATIVO") return;
  const company = one(db, "SELECT * FROM companies WHERE id=?", c.company_id),
    settings = settingsFor(company),
    k = knowledgeFor(db, company);
  let result;
  const context = JSON.parse(c.context);
  if (
    context.awaitingAcceptance &&
    /^(sim|aceito|aceitar|pode fechar|confirmo)[.!\s]*$/i.test(input)
  ) {
    const quote = one(
      db,
      "SELECT * FROM quotes WHERE conversation_id=? AND status='ENVIADO' ORDER BY created DESC LIMIT 1",
      c.id,
    );
    if (quote)
      run(db, "UPDATE quotes SET status='ACEITO' WHERE id=?", quote.id);
    result = {
      text: "Obrigado! Registrei seu aceite. Um atendente vai confirmar os próximos passos. O aceite ainda não representa pagamento ou venda confirmada.",
      handoff: true,
      context: {},
    };
  } else {
    result = reply(k.data, input, context);
    // Switched-off functions are not answered by the rules; the AI (or the
    // fallback) passes them to a person.
    if (
      (!settings.quotes &&
        (result.quote || result.context?.product || result.catalog)) ||
      (!settings.faq && result.faq)
    )
      result = {
        unknown: true,
        text: "Vou passar sua mensagem para um atendente, só um instante.",
        handoff: true,
        context: {},
      };
  }
  const isReal = c.mode === "whatsapp";
  const quotaReached = () =>
    isReal &&
    one(
      db,
      "SELECT COUNT(*) n FROM usage WHERE company_id=? AND kind='bot' AND state IN ('reserved','confirmed') AND substr(created,1,7)=?",
      c.company_id,
      now().slice(0, 7),
    ).n >= company.quota;
  if (quotaReached()) {
    run(
      db,
      "UPDATE conversations SET status='AGUARDANDO_ATENDENTE' WHERE id=?",
      c.id,
    );
    audit(db, c.company_id, "system", "quota.exhausted");
    return;
  }
  // Quotes, catalog lists, FAQ matches and human requests stay deterministic.
  // Everything else goes to the AI, which may also ask the owner or book;
  // without AI (or on failure) the deterministic answer is used.
  if (result.unknown || result.smalltalk) {
    try {
      const turn = await customerTurn(db, company, c, k, context);
      if (turn) result = await applyTurn(db, company, c, input, turn);
    } catch (e) {
      console.error("[IA] falha:", e.message);
    }
  }
  const latest = conversation(c.company_id, c.id);
  if (latest.status !== "BOT_ATIVO") return;
  transaction(db, () => {
    // Recheck inside transaction after asynchronous AI work across different conversations.
    if (quotaReached()) {
      run(
        db,
        "UPDATE conversations SET status='AGUARDANDO_ATENDENTE' WHERE id=?",
        c.id,
      );
      return;
    }
    if (result.quote) {
      const id = uid();
      run(
        db,
        "INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        c.company_id,
        c.id,
        "ORC-" + id.slice(0, 6).toUpperCase(),
        result.quote.product,
        result.quote.quantity,
        result.quote.total,
        result.quote.deposit,
        result.quote.conditions,
        "ENVIADO",
        k.version,
        now(),
      );
    }
    sendBot(db, c, result.text);
    run(
      db,
      "UPDATE conversations SET context=?,status=? WHERE id=?",
      JSON.stringify(result.context || {}),
      result.handoff ? "AGUARDANDO_ATENDENTE" : "BOT_ATIVO",
      c.id,
    );
  });
  if (result.handoff) notifyOwnerHandoff(db, company, c, input);
}
app.get(base + "/conversations/:id", (req, res) => {
  const c = conversation(req.company.id, req.params.id);
  res.json({
    ...c,
    messages: q(
      db,
      "SELECT * FROM messages WHERE conversation_id=? ORDER BY created,rowid",
      c.id,
    ),
  });
});
app.post(base + "/conversations/:id/message", async (req, res) => {
  const c = conversation(req.company.id, req.params.id),
    body = text(req.body.text);
  if (!body) fail("Digite uma mensagem.");
  if (req.body.role === "customer") {
    if (c.mode !== "simulation")
      fail("Mensagens de clientes reais chegam pelo conector.");
    await serialized(c.id, () =>
      processIncoming(conversation(c.company_id, c.id), body),
    );
  } else {
    if (c.status === "BOT_ATIVO")
      fail("Assuma o atendimento antes de responder.");
    addMessage(c, "human", body, c.mode === "whatsapp" ? "queued" : "sent");
  }
  res.json({ ok: true });
});
app.post(base + "/conversations/:id/status", (req, res) => {
  const c = conversation(req.company.id, req.params.id),
    status = req.body.status;
  if (!["BOT_ATIVO", "EM_ATENDIMENTO_HUMANO", "ENCERRADA"].includes(status))
    fail("Estado inválido.");
  transaction(db, () => {
    run(
      db,
      "UPDATE conversations SET status=?,context=?,updated=? WHERE id=?",
      status,
      "{}",
      now(),
      c.id,
    );
    if (status !== "BOT_ATIVO") {
      run(
        db,
        "UPDATE usage SET state='released' WHERE message_id IN (SELECT id FROM messages WHERE conversation_id=? AND role='bot' AND state='queued')",
        c.id,
      );
      run(
        db,
        "UPDATE messages SET state='cancelled' WHERE conversation_id=? AND role='bot' AND state='queued'",
        c.id,
      );
    }
    audit(db, c.company_id, req.user.id, "conversation.status", status);
  });
  res.json({ ok: true });
});
app.post(base + "/quotes/:id/status", (req, res) => {
  const quote = one(
    db,
    "SELECT * FROM quotes WHERE id=? AND company_id=?",
    req.params.id,
    req.company.id,
  );
  if (!quote) fail("Orçamento não encontrado.", 404);
  const transitions = {
    ENVIADO: ["ACEITO", "PERDIDO", "CANCELADO"],
    ACEITO: ["VENDA_CONFIRMADA", "PERDIDO", "CANCELADO"],
  };
  if (!transitions[quote.status]?.includes(req.body.status))
    fail("Transição de orçamento inválida.");
  run(db, "UPDATE quotes SET status=? WHERE id=?", req.body.status, quote.id);
  audit(
    db,
    req.company.id,
    req.user.id,
    "quote.status",
    `${quote.code}: ${req.body.status}`,
  );
  res.json({ ok: true });
});
app.post(base + "/numbers", (req, res) => {
  if (req.user.role !== "admin")
    fail("Apenas o administrador conecta números.", 403);
  const label = text(req.body.label, 100);
  if (!label) fail("Informe um nome para o número.");
  const token = randomBytes(32).toString("hex"),
    id = uid();
  transaction(db, () => {
    if (
      one(
        db,
        "SELECT COUNT(*) n FROM numbers WHERE company_id=?",
        req.company.id,
      ).n >= req.company.number_limit
    )
      fail("Limite de números atingido. Aumente o plano nas configurações.");
    run(
      db,
      "INSERT INTO numbers(id,company_id,label,token,created) VALUES(?,?,?,?,?)",
      id,
      req.company.id,
      label,
      hash(token),
      now(),
    );
  });
  const local = startLocalConnector(id, token, localCentral);
  res.json(local ? { id, local: true } : { id, token });
});
app.get(base + "/numbers/:id/qr", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  const n = one(
    db,
    "SELECT qr,heartbeat,status,pair_phone,pair_code FROM numbers WHERE id=? AND company_id=?",
    req.params.id,
    req.company.id,
  );
  if (!n) fail("Número não encontrado.", 404);
  const fresh = n.heartbeat && Date.now() - Date.parse(n.heartbeat) < 45000;
  res.json({
    ...n,
    status: fresh ? n.status : "offline",
    qr: fresh ? n.qr : null,
    pair_code: fresh ? n.pair_code : null,
  });
});
// Alternative to the QR code: WhatsApp shows "Connect with phone number" and
// the user types an 8-character code generated for that number.
app.post(base + "/numbers/:id/pair", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(phone))
    fail("Informe o número com DDI e DDD, só números. Ex.: 5511987654321.");
  const r = run(
    db,
    "UPDATE numbers SET pair_phone=?,pair_code=NULL WHERE id=? AND company_id=?",
    phone,
    req.params.id,
    req.company.id,
  );
  if (!r.changes) fail("Número não encontrado.", 404);
  res.json({ ok: true });
});
app.delete(base + "/numbers/:id", (req, res) => {
  if (req.user.role !== "admin") fail("Acesso não autorizado.", 403);
  transaction(db, () => {
    run(
      db,
      "UPDATE conversations SET number_id=NULL,status=? WHERE number_id=? AND company_id=?",
      "ENCERRADA",
      req.params.id,
      req.company.id,
    );
    run(
      db,
      "DELETE FROM numbers WHERE id=? AND company_id=?",
      req.params.id,
      req.company.id,
    );
  });
  stopLocalConnector(req.params.id);
  res.json({ ok: true });
});
// Connector endpoints use a per-number token, never the administrator session or an AI key.
const connector = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  req.number = token
    ? one(db, "SELECT * FROM numbers WHERE token=?", hash(token))
    : null;
  if (!req.number)
    return res.status(401).json({ error: "Conector não autorizado." });
  next();
};
app.post("/api/connector/heartbeat", connector, (req, res) => {
  const status = ["online", "connecting", "offline"].includes(req.body.status)
    ? req.body.status
    : "offline";
  const phone = text(req.body.phone, 30);
  if (
    phone &&
    one(
      db,
      "SELECT 1 FROM numbers WHERE phone=? AND id<>?",
      phone,
      req.number.id,
    )
  )
    fail("Este número já está cadastrado em outra conexão.", 409);
  const qr = text(req.body.qr, 20000);
  if (qr && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr))
    fail("QR inválido.");
  const pairCode = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(req.body.pairCode || "")
    ? req.body.pairCode.toUpperCase()
    : null;
  const online = status === "online";
  run(
    db,
    "UPDATE numbers SET status=?,heartbeat=?,qr=?,phone=?,pair_code=COALESCE(?,pair_code) WHERE id=?",
    status,
    now(),
    qr || null,
    phone || req.number.phone,
    pairCode,
    req.number.id,
  );
  if (online)
    run(
      db,
      "UPDATE numbers SET pair_phone=NULL,pair_code=NULL WHERE id=?",
      req.number.id,
    );
  const current = one(
    db,
    "SELECT pair_phone,pair_code FROM numbers WHERE id=?",
    req.number.id,
  );
  res.json({
    ok: true,
    pairPhone: !online && !current.pair_code ? current.pair_phone : null,
  });
});
app.post("/api/connector/incoming", connector, async (req, res) => {
  const n = req.number,
    externalId = text(req.body.id, 200),
    address = text(req.body.address, 200),
    body = text(req.body.text);
  if (!externalId || !address || !body) fail("Mensagem incompleta.");
  if (!/@(s.whatsapp.net|lid)$/.test(address))
    fail("Somente conversas individuais são suportadas.");
  // The owner writing in the "message yourself" chat talks to the assistant.
  if (req.body.owner === true) {
    if (
      one(
        db,
        "SELECT 1 FROM inbound WHERE number_id=? AND external_id=?",
        n.id,
        externalId,
      )
    )
      return res.json({ duplicate: true });
    run(db, "INSERT INTO inbound VALUES(?,?)", n.id, externalId);
    const company = one(db, "SELECT * FROM companies WHERE id=?", n.company_id);
    await serialized("owner:" + company.id, async () => {
      const r = await handleOwnerMessage(db, company, body);
      sendToOwner(db, company.id, r.ownerReply);
    });
    return res.json({ ok: true });
  }
  if (
    one(
      db,
      "SELECT 1 FROM inbound WHERE number_id=? AND external_id=?",
      n.id,
      externalId,
    )
  )
    return res.json({ duplicate: true });
  let c = one(
    db,
    "SELECT * FROM conversations WHERE number_id=? AND address=?",
    n.id,
    address,
  );
  if (!c) {
    const id = uid();
    run(
      db,
      "INSERT INTO conversations(id,company_id,number_id,contact,address,mode,updated) VALUES(?,?,?,?,?,?,?)",
      id,
      n.company_id,
      n.id,
      text(req.body.name, 100) || address.split("@")[0],
      address,
      "whatsapp",
      now(),
    );
    c = conversation(n.company_id, id);
  }
  await serialized(c.id, async () => {
    if (
      one(
        db,
        "SELECT 1 FROM inbound WHERE number_id=? AND external_id=?",
        n.id,
        externalId,
      )
    )
      return;
    run(db, "INSERT INTO inbound VALUES(?,?)", n.id, externalId);
    await processIncoming(conversation(n.company_id, c.id), body);
  });
  res.json({ ok: true });
});
app.get("/api/connector/outbox", connector, (req, res) => {
  const pending = transaction(db, () => {
    const rows = q(
      db,
      "SELECT m.id,m.text,c.address FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.number_id=? AND m.state='queued' ORDER BY m.created LIMIT 10",
      req.number.id,
    );
    for (const m of rows)
      run(db, "UPDATE messages SET state='sending' WHERE id=?", m.id);
    return rows;
  });
  res.json(pending);
});
app.post("/api/connector/ack", connector, (req, res) => {
  const m = one(
    db,
    "SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND c.number_id=?",
    text(req.body.id, 100),
    req.number.id,
  );
  if (!m) fail("Mensagem não encontrada.", 404);
  if (m.state !== "sending") return res.json({ ok: true });
  const state = req.body.ok === true ? "sent" : "uncertain";
  transaction(db, () => {
    run(db, "UPDATE messages SET state=? WHERE id=?", state, m.id);
    run(
      db,
      "UPDATE usage SET state=? WHERE message_id=?",
      state === "sent" ? "confirmed" : "reserved",
      m.id,
    );
  });
  res.json({ ok: true });
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Rota não encontrada." }),
);
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  console.error(`[${status}] ${err.message}`);
  res.status(status).json({
    error:
      status === 500
        ? "Não foi possível concluir a operação. Consulte o log do servidor."
        : err.message,
  });
});
app.listen(port, host, () => {
  console.log(`cAssistAI disponível em http://${host}:${port}`);
  console.log(
    aiReady()
      ? `IA ligada (${new URL(aiBase()).host}, modelo ${process.env.AI_MODEL}).`
      : "IA desligada: sem AI_API_KEY no arquivo .env. O bot responde só pela planilha.",
  );
  resumeLocalConnectors(
    q(db, "SELECT id FROM numbers").map((n) => n.id),
    localCentral,
  );
});
