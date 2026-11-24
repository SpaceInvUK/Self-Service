// Test mode: the assistant answers only the contacts the owner marked.
// Contacts come from the connected WhatsApp, from people who wrote, from the
// phone's address book (Android) or typed by hand.
import { q, one, run, uid, now } from "./db.mjs";

export const digits = (v) => String(v || "").replace(/\D/g, "");
const userPart = (jid) =>
  String(jid || "")
    .split("@")[0]
    .split(":")[0];
// Brazilian mobiles may appear with or without the 9 after the area code.
export function phoneKeys(phone) {
  const d = digits(phone);
  if (!d) return [];
  const keys = [d];
  if (/^55\d{2}9\d{8}$/.test(d)) keys.push(d.slice(0, 4) + d.slice(5));
  else if (/^55\d{2}[6-9]\d{7}$/.test(d))
    keys.push(d.slice(0, 4) + "9" + d.slice(4));
  return keys;
}
// Typed or address-book numbers: Brazilian numbers without +55 get it.
export function normalizePhone(v) {
  const raw = String(v || "").trim();
  // "+..." or "00..." already carries the country code.
  const international = /^(\+|00)/.test(raw);
  let d = digits(raw).replace(/^00/, "");
  if (!international) {
    d = d.replace(/^0+/, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}
const phoneOf = (jid) =>
  /@s\.whatsapp\.net$/.test(jid || "") ? userPart(jid) : "";

export function upsertContact(
  db,
  cid,
  { jid, alt, name, source, seen = false },
) {
  if (!jid || !/@(s\.whatsapp\.net|lid)$/.test(jid)) return null;
  const phone = phoneOf(jid) || phoneOf(alt);
  const existing =
    one(db, "SELECT * FROM contacts WHERE company_id=? AND jid=?", cid, jid) ||
    (alt &&
      one(
        db,
        "SELECT * FROM contacts WHERE company_id=? AND (jid=? OR alt=?)",
        cid,
        alt,
        jid,
      )) ||
    (phone &&
      phoneKeys(phone)
        .map((k) =>
          one(
            db,
            "SELECT * FROM contacts WHERE company_id=? AND phone=?",
            cid,
            k,
          ),
        )
        .find(Boolean));
  const clean = String(name || "")
    .trim()
    .slice(0, 80);
  if (existing) {
    run(
      db,
      "UPDATE contacts SET alt=COALESCE(alt,?),phone=COALESCE(NULLIF(phone,''),?),name=CASE WHEN ?<>'' THEN ? ELSE name END,last_seen=COALESCE(?,last_seen) WHERE id=?",
      alt && alt !== existing.jid ? alt : null,
      phone || null,
      clean,
      clean,
      seen ? now() : null,
      existing.id,
    );
    return existing.id;
  }
  const id = uid();
  run(
    db,
    "INSERT INTO contacts(id,company_id,jid,alt,phone,name,source,last_seen,created) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    cid,
    jid,
    alt || null,
    phone || null,
    clean,
    source || "whatsapp",
    seen ? now() : null,
    now(),
  );
  return id;
}
// Adds (and marks) a typed or address-book number.
export function addPhone(db, cid, phoneIn, name, source = "manual") {
  const phone = normalizePhone(phoneIn);
  if (!phone) return null;
  const known = phoneKeys(phone)
    .map((k) =>
      one(db, "SELECT * FROM contacts WHERE company_id=? AND phone=?", cid, k),
    )
    .find(Boolean);
  if (known) {
    run(
      db,
      "UPDATE contacts SET allowed=1,name=CASE WHEN name='' THEN ? ELSE name END WHERE id=?",
      String(name || "").slice(0, 80),
      known.id,
    );
    return known.id;
  }
  const id = upsertContact(db, cid, {
    jid: `${phone}@s.whatsapp.net`,
    name,
    source,
  });
  run(db, "UPDATE contacts SET allowed=1 WHERE id=?", id);
  return id;
}
export function isAllowed(db, cid, jid, alt) {
  const ids = [jid, alt].filter(Boolean);
  const phones = ids.map(phoneOf).filter(Boolean).flatMap(phoneKeys);
  for (const id of ids)
    if (
      one(
        db,
        "SELECT 1 FROM contacts WHERE company_id=? AND allowed=1 AND (jid=? OR alt=?)",
        cid,
        id,
        id,
      )
    )
      return true;
  for (const p of phones)
    if (
      one(
        db,
        "SELECT 1 FROM contacts WHERE company_id=? AND allowed=1 AND phone=?",
        cid,
        p,
      )
    )
      return true;
  return false;
}
export function listContacts(db, cid, search = "") {
  const term = `%${String(search).trim().toLowerCase()}%`;
  return q(
    db,
    "SELECT id,jid,phone,name,allowed,source,last_seen FROM contacts WHERE company_id=? AND (?='%%' OR lower(name) LIKE ? OR phone LIKE ?) ORDER BY allowed DESC, last_seen IS NULL, last_seen DESC, name='' , name COLLATE NOCASE LIMIT 300",
    cid,
    term,
    term,
    term,
  );
}
export const contactCounts = (db, cid) =>
  one(
    db,
    "SELECT COUNT(*) total, COALESCE(SUM(allowed),0) allowed FROM contacts WHERE company_id=?",
    cid,
  );
