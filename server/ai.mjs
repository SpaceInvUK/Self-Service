// OpenAI-compatible chat provider (Groq by default in local installs).
import { one, run, uid, now } from "./db.mjs";

export const aiBase = () =>
  (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
export const aiReady = () =>
  Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);

// AI_MODEL=auto picks the first available model from this list, so a free
// provider changing its catalogue does not silently turn the AI off.
const preferredModels = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];
let modelCache = null;
export async function aiModel() {
  if (process.env.AI_MODEL !== "auto") return process.env.AI_MODEL;
  if (modelCache && Date.now() - modelCache.at < 6 * 3600000)
    return modelCache.id;
  const r = await fetch(aiBase() + "/models", {
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    console.error(`[IA] lista de modelos indisponível (HTTP ${r.status}).`);
    return null;
  }
  const ids = ((await r.json()).data || []).map((m) => m.id);
  const id = preferredModels.find((m) => ids.includes(m)) || null;
  if (!id)
    console.error("[IA] nenhum modelo conhecido disponível; defina AI_MODEL.");
  else if (modelCache?.id !== id) console.log(`[IA] usando o modelo ${id}.`);
  modelCache = { id, at: Date.now() };
  return id;
}

// Sends a chat and returns the JSON object the model answered with, or null.
export async function chatJSON(db, companyId, messages) {
  if (!aiReady()) return null;
  // Daily call cap limits exposure; free provider plans also enforce their own limits.
  const used = one(
    db,
    "SELECT COUNT(*) n FROM ai_usage WHERE company_id=? AND substr(created,1,10)=?",
    companyId,
    now().slice(0, 10),
  ).n;
  if (used >= Number(process.env.AI_DAILY_LIMIT || 1000)) {
    console.error("[IA] limite diário de chamadas atingido.");
    return null;
  }
  const endpoint = new URL(aiBase() + "/chat/completions");
  if (endpoint.protocol !== "https:") return null;
  const model = await aiModel();
  if (!model) return null;
  const reasoning = model.includes("gpt-oss");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      // Reasoning models spend part of the budget thinking before answering.
      max_tokens: reasoning ? 2000 : 700,
      ...(reasoning ? { reasoning_effort: "low" } : {}),
      temperature: 0.4,
      messages,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    console.error(
      `[IA] provedor respondeu HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
    if (response.status === 404 || response.status === 400) modelCache = null;
    return null;
  }
  const data = await response.json(),
    u = data.usage || {},
    i = u.prompt_tokens || 0,
    o = u.completion_tokens || 0;
  const ip = process.env.AI_INPUT_USD_PER_MILLION,
    op = process.env.AI_OUTPUT_USD_PER_MILLION;
  const cost = ip && op ? (i * Number(ip) + o * Number(op)) / 1000000 : null;
  run(
    db,
    "INSERT INTO ai_usage VALUES(?,?,?,?,?,?,?)",
    uid(),
    companyId,
    model,
    i,
    o,
    Number.isFinite(cost) ? cost : null,
    now(),
  );
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return null;
  try {
    return JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content);
  } catch {
    // Model answered in plain text: treat it as the message itself.
    return { reply: content.trim() };
  }
}

// Speech to text (Whisper on Groq's free plan). Returns the text or null.
export const audioMaxSeconds = () =>
  Math.min(7200, Math.max(10, Number(process.env.AUDIO_MAX_SECONDS || 600)));
export async function transcribe(db, companyId, base64, mimetype, seconds) {
  if (!aiReady()) return null;
  const endpoint = new URL(aiBase() + "/audio/transcriptions");
  if (endpoint.protocol !== "https:") return null;
  const model =
    process.env.AI_AUDIO_MODEL ||
    (endpoint.host.includes("openai.com")
      ? "whisper-1"
      : "whisper-large-v3-turbo");
  const ext = /mpeg|mp3/.test(mimetype)
    ? "mp3"
    : /mp4|m4a|aac/.test(mimetype)
      ? "m4a"
      : "ogg";
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(base64, "base64")], {
      type: String(mimetype).split(";")[0],
    }),
    `audio.${ext}`,
  );
  form.append("model", model);
  form.append("language", "pt");
  form.append("response_format", "json");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    console.error(
      `[IA] transcrição recusada (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`,
    );
    return null;
  }
  const text = String((await r.json()).text || "").trim();
  run(
    db,
    "INSERT INTO ai_usage VALUES(?,?,?,?,?,?,?)",
    uid(),
    companyId,
    model,
    Math.round(seconds || 0),
    0,
    null,
    now(),
  );
  return text || null;
}
