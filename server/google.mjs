// Google Calendar for appointments: OAuth "desktop app" with a loopback
// redirect, free/busy lookup and event creation. Needs GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET in .env (created in the owner's Google Cloud project).
const oauthUrl = () =>
  process.env.GOOGLE_OAUTH_URL ||
  "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = () =>
  process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const apiUrl = () =>
  process.env.GOOGLE_API_URL || "https://www.googleapis.com/calendar/v3";
const scopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function authUrl(redirectUri, state) {
  const u = new URL(oauthUrl());
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return u.toString();
}
async function token(params) {
  const r = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Error(`Google recusou o acesso (${data.error || r.status}).`);
  return data;
}
export const exchangeCode = (code, redirectUri) =>
  token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });

const accessCache = new Map();
async function accessToken(refreshToken) {
  const cached = accessCache.get(refreshToken);
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  const t = await token({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  accessCache.set(refreshToken, {
    token: t.access_token,
    expires: Date.now() + (t.expires_in || 3600) * 1000,
  });
  return t.access_token;
}
async function call(refreshToken, path, body) {
  const r = await fetch(apiUrl() + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(refreshToken)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`Agenda do Google respondeu HTTP ${r.status}.`);
  return data;
}
export async function busyTimes(refreshToken, timeMin, timeMax) {
  const data = await call(refreshToken, "/freeBusy", {
    timeMin,
    timeMax,
    items: [{ id: "primary" }],
  });
  return data.calendars?.primary?.busy || [];
}
export async function createEvent(
  refreshToken,
  { start, end, summary, description },
) {
  const data = await call(refreshToken, "/calendars/primary/events", {
    summary,
    description,
    start: { dateTime: start },
    end: { dateTime: end },
  });
  return data.id;
}
