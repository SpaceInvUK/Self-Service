// Business hours and appointment slots in the company's time zone.
const weekdays = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const short = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Wall-clock parts of an instant in a time zone.
export function zoned(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  return {
    y: +parts.year,
    m: +parts.month,
    d: +parts.day,
    hh: +parts.hour,
    mm: +parts.minute,
    dow,
  };
}
// Instant for a wall-clock time in a time zone (handles DST by re-checking).
export function fromZoned(y, m, d, hh, mm, tz) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const z = zoned(new Date(t), tz);
    const shown = Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm);
    t += Date.UTC(y, m - 1, d, hh, mm) - shown;
  }
  return new Date(t);
}
const minutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
export const validTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// days: {"0": null | ["08:00","18:00"], ...}
export function openStatus(settings, now = new Date()) {
  if (!settings.hoursSet) return null;
  const z = zoned(now, settings.tz);
  const today = settings.days[z.dow];
  const nowMin = z.hh * 60 + z.mm;
  if (today && nowMin >= minutes(today[0]) && nowMin < minutes(today[1]))
    return { open: true, closes: today[1] };
  for (let i = 0; i < 8; i++) {
    const dow = (z.dow + i) % 7,
      day = settings.days[dow];
    if (!day || (i === 0 && nowMin >= minutes(day[0]))) continue;
    const when = i === 0 ? "hoje" : i === 1 ? "amanhã" : weekdays[dow];
    return { open: false, opens: `${when} às ${day[0]}` };
  }
  return { open: false, opens: null };
}
export function hoursText(settings) {
  if (!settings.hoursSet) return "";
  return [1, 2, 3, 4, 5, 6, 0]
    .map(
      (d) =>
        `${weekdays[d]}: ${settings.days[d] ? settings.days[d].join(" às ") : "fechado"}`,
    )
    .join("; ");
}
// Free appointment starts for the next `daysAhead` days, at least 1h from now.
export function freeSlots(
  settings,
  busy,
  now = new Date(),
  daysAhead = 7,
  limit = 40,
) {
  if (!settings.hoursSet) return [];
  const slot = settings.slot,
    out = [];
  const earliest = now.getTime() + 60 * 60000;
  const z = zoned(now, settings.tz);
  for (let i = 0; i < daysAhead && out.length < limit; i++) {
    const base = new Date(Date.UTC(z.y, z.m - 1, z.d + i, 12));
    const day = zoned(base, "UTC");
    const hours = settings.days[day.dow];
    if (!hours) continue;
    // Each appointment takes `slot` minutes plus the break between them.
    const step = slot + (settings.gap || 0);
    for (let t = minutes(hours[0]); t + slot <= minutes(hours[1]); t += step) {
      const start = fromZoned(
        day.y,
        day.m,
        day.d,
        Math.floor(t / 60),
        t % 60,
        settings.tz,
      );
      const end = new Date(start.getTime() + slot * 60000);
      if (start.getTime() < earliest) continue;
      if (busy.some((b) => start < new Date(b.end) && end > new Date(b.start)))
        continue;
      out.push({ start: start.toISOString(), end: end.toISOString() });
      if (out.length >= limit) break;
    }
  }
  return out;
}
export function slotLabel(iso, tz) {
  const z = zoned(new Date(iso), tz);
  return `${short[z.dow]} ${String(z.d).padStart(2, "0")}/${String(z.m).padStart(2, "0")} às ${String(z.hh).padStart(2, "0")}:${String(z.mm).padStart(2, "0")}`;
}
export function nowLabel(tz, now = new Date()) {
  const z = zoned(now, tz);
  return `${weekdays[z.dow]}, ${String(z.d).padStart(2, "0")}/${String(z.m).padStart(2, "0")}/${z.y}, ${String(z.hh).padStart(2, "0")}:${String(z.mm).padStart(2, "0")}`;
}
// "qua 11/11, das 14:00 às 15:00"
export function rangeLabel(startIso, endIso, tz) {
  const a = zoned(new Date(startIso), tz),
    b = zoned(new Date(endIso), tz);
  const hm = (z) =>
    `${String(z.hh).padStart(2, "0")}:${String(z.mm).padStart(2, "0")}`;
  return `${short[a.dow]} ${String(a.d).padStart(2, "0")}/${String(a.m).padStart(2, "0")}, das ${hm(a)} às ${hm(b)}`;
}
