import { json, safeText, clampInt, formatBusinessHoursNote } from "./lib.js";

const minutesToHHMM = (m) => {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const hhmmToMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
};

const getHoursForDate = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const isWeekend = day === 0 || day === 6;
  const openMin = isWeekend ? (5 * 60) : (16 * 60 + 30);
  const closeMin = 22 * 60;
  return { openMin, closeMin, isWeekend };
};

export async function onRequestGet({ request, env }) {
  if (!env.BOOKINGS_DB) return json({ error: "Server not configured: missing D1 binding DB." }, { status: 500 });

  const url = new URL(request.url);
  const date = safeText(url.searchParams.get("date"), 20);
  const durationMin = clampInt(url.searchParams.get("duration"), 30, 12 * 60) || 120;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date." }, { status: 400 });

  const { openMin, closeMin } = getHoursForDate(date);
  const latestStart = closeMin - durationMin;

  // Fetch blocks for the date
  const now = Date.now();
  const rows = await env.BOOKINGS_DB.prepare(
    `SELECT start_time, duration_min, start_ms, end_ms, status, expires_at_ms
     FROM bookings
     WHERE date = ?
       AND status IN ('approved','pending')
       AND (status = 'approved' OR (status = 'pending' AND expires_at_ms > ?))`
  ).bind(date, now).all();

  const blocks = (rows.results || []).map((r) => {
    // Prefer ms if present; fallback to time+duration in minutes.
    let sMin = null, eMin = null;
    if (typeof r.start_time === "string" && r.start_time.includes(":")) {
      sMin = hhmmToMinutes(r.start_time);
      eMin = sMin + (r.duration_min || 0);
    }
    return { sMin, eMin };
  }).filter((b) => b.sMin !== null && b.eMin !== null);

  const slots = [];
  for (let m = openMin; m <= latestStart; m += 30) {
    const start = m;
    const end = m + durationMin;

    // Skip if overlaps any block
    let ok = true;
    for (const b of blocks) {
      if (!(end <= b.sMin || start >= b.eMin)) { ok = false; break; }
    }
    if (!ok) continue;

    slots.push({ start: minutesToHHMM(start), end: minutesToHHMM(end) });
  }

  return json({
    date,
    durationMin,
    slots,
    note: slots.length ? formatBusinessHoursNote(date) : "No slots free for that duration within working hours."
  });
}
