import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  generateMessageID,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
const central = (process.env.CENTRAL_URL || "").replace(/\/$/, ""),
  token = process.env.CONNECTOR_TOKEN;
if (!central || !token)
  throw Error("Configure CENTRAL_URL e CONNECTOR_TOKEN no arquivo .env.");
const url = new URL(central);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
)
  throw Error("Use HTTPS para uma central remota.");
const dir = resolve(process.env.SESSION_DIR || "./auth");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const statePath = resolve(dir, "outbox.json"),
  inboxPath = resolve(dir, "inbox.json");
const read = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const delivered = read(statePath),
  incoming = read(inboxPath);
function persist(path, data) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  renameSync(tmp, path);
}
const logger = pino({ level: "silent" });
let socket,
  status = "offline",
  qr = null,
  phone = "",
  connecting = false,
  stopped = false;
async function api(path, body) {
  const r = await fetch(central + "/api/connector/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401) {
    stopped = true;
    socket?.end(Error("Conector revogado"));
    throw Error("Token revogado. Cadastre uma nova conexão na central.");
  }
  if (!r.ok) throw Error(`Central respondeu HTTP ${r.status}`);
  return r.json();
}
let pairCode = null,
  pairedFor = null,
  qrSeen = false,
  teamNames = [],
  teamJid = null,
  groupsCheckedAt = 0;
const groupKey = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s/g, "");
// Finds the team group (by the name set in the panel) among this number's groups.
async function findTeamGroup(force = false) {
  if (status !== "online" || !socket || !teamNames.length) return;
  if (!force && Date.now() - groupsCheckedAt < 5 * 60000) return;
  groupsCheckedAt = Date.now();
  try {
    const groups = Object.values(await socket.groupFetchAllParticipating());
    const found = groups.find((g) => teamNames.includes(groupKey(g.subject)));
    const next = found?.id || null;
    if (next !== teamJid)
      console.log(
        next
          ? `Grupo da equipe encontrado: ${found.subject}.`
          : "Grupo da equipe não encontrado; usando a conversa com você mesmo.",
      );
    teamJid = next;
  } catch (e) {
    console.error("Não foi possível listar os grupos:", e.message);
  }
}
async function heartbeat() {
  const r = await api("heartbeat", {
    status,
    qr,
    phone,
    pairCode,
    ...(status === "online" ? { teamJid: teamJid || "" } : {}),
  });
  if (Number.isInteger(r.audioMaxSeconds)) audioMaxSeconds = r.audioMaxSeconds;
  const names = Array.isArray(r.teamGroups) ? r.teamGroups : [];
  if (names.join() !== teamNames.join()) {
    teamNames = names;
    await findTeamGroup(true);
  } else await findTeamGroup();
  // The panel asked to connect by phone number instead of QR code.
  if (
    r.pairPhone &&
    r.pairPhone !== pairedFor &&
    qrSeen &&
    status !== "online"
  ) {
    pairedFor = r.pairPhone;
    try {
      pairCode = await socket.requestPairingCode(r.pairPhone);
      console.log("Código de conexão disponível no painel cAssistAI.");
      await api("heartbeat", { status, qr, phone, pairCode });
    } catch (e) {
      pairedFor = null;
      console.error("Não foi possível gerar o código:", e.message);
    }
  }
}
async function connect() {
  if (connecting || stopped) return;
  connecting = true;
  status = "connecting";
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  socket = makeWASocket({
    auth: state,
    logger,
    browser: Browsers.ubuntu("cAssistAI"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async (update) => {
    try {
      if (update.qr) {
        qrSeen = true;
        qr = await QRCode.toDataURL(update.qr);
        status = "connecting";
        await heartbeat();
        console.log("QR disponível no painel cAssistAI.");
      }
      if (update.connection === "open") {
        status = "online";
        qr = null;
        pairCode = null;
        pairedFor = null;
        phone = (socket.user?.id || "").split(":")[0].split("@")[0];
        await heartbeat();
        console.log("WhatsApp conectado.");
      }
      if (update.connection === "close") {
        status = "offline";
        qr = null;
        qrSeen = false;
        pairCode = null;
        pairedFor = null;
        connecting = false;
        const loggedOut =
          update.lastDisconnect?.error?.output?.statusCode ===
          DisconnectReason.loggedOut;
        if (loggedOut) {
          stopped = true;
          console.log(
            "Sessão encerrada. Remova a pasta de sessão apenas se desejar um novo pareamento.",
          );
        } else
          setTimeout(
            () => connect().catch((e) => console.error(e.message)),
            5000,
          );
      }
    } catch (e) {
      console.error(e.message);
    }
  });
  // Group renamed or the number added to a group: look for the team group again.
  socket.ev.on("groups.upsert", () => findTeamGroup(true));
  socket.ev.on("groups.update", () => findTeamGroup(true));
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || !m.key.id) continue;
      // Team group: messages from members (and the owner on this number).
      if (teamJid && jid === teamJid) {
        if (m.key.fromMe && sentByBot.has(m.key.id)) continue;
        const ts = Number(m.messageTimestamp || 0) * 1000;
        if (ts && ts < startedAt - 60000) continue;
        const content = m.message?.ephemeralMessage?.message || m.message;
        const doc =
          content?.documentMessage ||
          content?.documentWithCaptionMessage?.message?.documentMessage;
        const voice = await audioFields(m, content);
        const text =
          content?.conversation ||
          content?.extendedTextMessage?.text ||
          (doc ? doc.fileName || "arquivo" : voice ? "[áudio]" : "");
        if (!text) continue;
        incoming[m.key.id] = {
          ...voice,
          id: m.key.id,
          address: jid,
          team: true,
          fromMe: Boolean(m.key.fromMe),
          sender: m.key.participant || "",
          senderPn: m.key.participantPn || m.key.participantAlt || "",
          quotedId:
            content?.extendedTextMessage?.contextInfo?.stanzaId ||
            content?.audioMessage?.contextInfo?.stanzaId ||
            "",
          document: Boolean(doc),
          text,
        };
        persist(inboxPath, incoming);
        continue;
      }
      if (!/@(s.whatsapp.net|lid)$/.test(jid)) continue;
      // "Message yourself" chat = the owner talking to the assistant. Skip
      // what the assistant itself sent there and anything from before start.
      const owner = m.key.fromMe && isSelf(jid);
      if (owner) {
        if (sentByBot.has(m.key.id)) continue;
        const ts = Number(m.messageTimestamp || 0) * 1000;
        if (ts && ts < startedAt - 60000) continue;
      } else if (m.key.fromMe || type !== "notify") continue;
      const content = m.message?.ephemeralMessage?.message || m.message;
      const voice = await audioFields(m, content);
      const text =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        (voice
          ? "[áudio]"
          : owner
            ? ""
            : "[Conteúdo não textual recebido — solicitar atendimento humano]");
      if (!text) continue;
      incoming[m.key.id] = {
        ...voice,
        id: m.key.id,
        address: jid,
        name: m.pushName || "",
        text,
        ...(owner ? { owner: true } : {}),
      };
      persist(inboxPath, incoming);
    }
    await drainInbox();
  });
}
const startedAt = Date.now();
let audioMaxSeconds = 600;
// Voice notes are downloaded here and transcribed by the central.
async function audioFields(m, content) {
  const audio = content?.audioMessage;
  if (!audio) return null;
  const seconds = Number(audio.seconds || 0);
  if (seconds > audioMaxSeconds) return { audioTooLong: seconds };
  try {
    const data = await downloadMediaMessage(
      m,
      "buffer",
      {},
      { logger, reuploadRequest: socket.updateMediaMessage },
    );
    if (data.length > 24 * 1024 * 1024) return { audioTooLong: seconds };
    return {
      audio: {
        data: data.toString("base64"),
        mimetype: audio.mimetype || "audio/ogg",
        seconds,
      },
    };
  } catch (e) {
    console.error("Áudio não baixado:", e.message);
    return { audioFailed: true };
  }
}
const sentByBot = new Set();
const userPart = (jid) =>
  String(jid || "")
    .split("@")[0]
    .split(":")[0];
function isSelf(jid) {
  const me = [socket?.user?.id, socket?.user?.lid]
    .filter(Boolean)
    .map(userPart);
  return me.includes(userPart(jid));
}
let draining = false;
async function drainInbox() {
  if (draining || stopped) return;
  draining = true;
  try {
    for (const [id, body] of Object.entries(incoming)) {
      await api("incoming", body);
      delete incoming[id];
      persist(inboxPath, incoming);
    }
  } catch (e) {
    console.error("Recepção pendente:", e.message);
  } finally {
    draining = false;
  }
}
let polling = false;
async function poll() {
  if (polling || stopped || status !== "online") return;
  polling = true;
  try {
    for (const [id, ack] of Object.entries(delivered)) {
      await api("ack", ack);
      delete delivered[id];
      persist(statePath, delivered);
    }
    const rows = await api("outbox");
    for (const m of rows) {
      // Persist uncertain state BEFORE network send. Never blindly resend after a crash.
      delivered[m.id] = { id: m.id, ok: false };
      persist(statePath, delivered);
      try {
        // The id is known before sending: WhatsApp echoes our own message
        // back before sendMessage resolves, and it must not look like the owner.
        const messageId = generateMessageID();
        sentByBot.add(messageId);
        if (sentByBot.size > 500)
          sentByBot.delete(sentByBot.values().next().value);
        await socket.sendMessage(m.address, { text: m.text }, { messageId });
        delivered[m.id] = { id: m.id, ok: true, waId: messageId };
        persist(statePath, delivered);
      } catch {
        console.error("Envio sem confirmação; requer verificação humana.");
      }
      await api("ack", delivered[m.id]);
      delete delivered[m.id];
      persist(statePath, delivered);
    }
  } catch (e) {
    console.error("Conector:", e.message);
  } finally {
    polling = false;
  }
}
await heartbeat();
await connect();
setInterval(() => {
  if (!stopped) heartbeat().catch((e) => console.error(e.message));
}, 10000);
setInterval(() => {
  drainInbox();
  poll();
}, 2500);
process.on("SIGINT", () => {
  stopped = true;
  status = "offline";
  heartbeat().finally(() => process.exit(0));
});
