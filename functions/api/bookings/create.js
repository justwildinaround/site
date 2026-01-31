import {
  json,
  nowMs,
  randomToken,
  safeText,
  clampInt,
  getBaseUrl,
  sendEmail,
  makeEmailHtml,
  formatBusinessHoursNote
} from "./lib.js";

const hhmmToMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
};

const getHoursForDate = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const isWeekend = day === 0 || day === 6;

  // weekend: 10:00–22:00
  // weekday: 16:30–22:00
  const openMin = isWeekend ? (10 * 60) : (16 * 60 + 30);
  const closeMin = 22 * 60;

  return { openMin, closeMin };
};

export async function onRequestPost({ request, env }) {
  if (!env.BOOKINGS_DB) {
    return json({ error: "Server not configured: missing D1 binding BOOKINGS_DB." }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, { status: 400 });
  }

  const date = safeText(body.date, 20);
  const startTime = safeText(body.startTime, 10);
  const durationMin = clampInt(body.durationMin, 30, 12 * 60);
  const startMs = clampInt(body.startMs, 0, 9e15);
  const endMs = clampInt(body.endMs, 0, 9e15);

  const customer = body.customer || {};
  const details = body.details || {};

  const name = safeText(customer.name, 120);
  const email = safeText(customer.email, 160);
  const phone = safeText(customer.phone, 60);

  const location = safeText(details.location, 160);
  const vehicle = safeText(details.vehicle, 160);
  const vehicleSize = safeText(details.vehicleSize, 30);
  const pkg = safeText(details.package, 60);
  const addons = safeText(details.addons, 300);
  const notes = safeText(details.notes, 2000);

  const pricing = body.pricing || {};
  const packagePrice = Number(pricing.packagePrice || 0);
  const addonsTotal = Number(pricing.addonsTotal || 0);
  const fees = Number(pricing.fees || 0);
  const tax = Number(pricing.tax || 0);
  const total = Number(pricing.total || 0);
  const currency = safeText(pricing.currency || "CAD", 8);

  const estimateLine =
    total > 0
      ? `Estimate: $${total.toFixed(2)} ${currency} (package $${packagePrice.toFixed(2)} + add-ons $${addonsTotal.toFixed(2)} + fees $${fees.toFixed(2)} + HST $${tax.toFixed(2)})`
      : "";

  const notesWithPricing = safeText([notes, estimateLine].filter(Boolean).join("\n\n"), 2000);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date." }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime)) return json({ error: "Invalid start time." }, { status: 400 });
  if (!durationMin || !startMs || !endMs || endMs <= startMs) return json({ error: "Invalid duration/timestamps." }, { status: 400 });
  if (!name || !email || !location || !vehicle) return json({ error: "Missing required fields." }, { status: 400 });

  // Enforce business hours
  const { openMin, closeMin } = getHoursForDate(date);
  const startMin = hhmmToMinutes(startTime);
  const endMin = startMin + durationMin;

  if (startMin < openMin || endMin > closeMin) {
    return json({ error: "That time doesn't fit within business hours." }, { status: 400 });
  }

  const createdAt = nowMs();
  const expiresAt = createdAt + 45 * 60_000; // 45-minute soft hold
  const approveToken = randomToken(32);
  const rejectToken = randomToken(32);

  // Overlap check
  const overlap = await env.BOOKINGS_DB.prepare(
    `SELECT id FROM bookings
     WHERE date = ?
       AND status IN ('approved','pending')
       AND NOT (end_ms <= ? OR start_ms >= ?)
       AND (status = 'approved' OR (status = 'pending' AND expires_at_ms > ?))
     LIMIT 1`
  ).bind(date, startMs, endMs, createdAt).first();

  if (overlap) {
    return json({ error: "That time overlaps an existing booking/hold. Please pick another start time." }, { status: 409 });
  }

  // Insert booking
  const insert = await env.BOOKINGS_DB.prepare(
    `INSERT INTO bookings
     (date, start_time, duration_min, start_ms, end_ms, status, expires_at_ms,
      customer_name, customer_email, customer_phone,
      location, vehicle, vehicle_size, package, addons, notes,
      approve_token, reject_token, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    date, startTime, durationMin, startMs, endMs, expiresAt,
    name, email, phone,
    location, vehicle, vehicleSize, pkg, addons, notesWithPricing,
    approveToken, rejectToken, createdAt, createdAt
  ).run();

  const bookingId = insert.meta?.last_row_id;
  if (!bookingId) return json({ error: "Failed to create booking." }, { status: 500 });

  const baseUrl = getBaseUrl(request, env);
  const businessEmail = (env.BUSINESS_EMAIL || "").trim();
  if (!businessEmail) {
    return json({ bookingId, warning: "Booking created, but BUSINESS_EMAIL is not set." }, { status: 201 });
  }

  const approveUrl = `${baseUrl}/api/bookings/approve?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${baseUrl}/api/bookings/reject?token=${encodeURIComponent(rejectToken)}`;

  const lines = [
    `<strong>New booking request (pending hold)</strong> — expires in 45 minutes.`,
    `<strong>Date:</strong> ${date} (${formatBusinessHoursNote(date)})`,
    `<strong>Requested start time:</strong> ${startTime}`,
    `<strong>Customer:</strong> ${name} (${email}${phone ? ` • ${phone}` : ""})`,
    `<strong>Location:</strong> ${location}`,
    `<strong>Vehicle:</strong> ${vehicle} (${vehicleSize || "n/a"})`,
    `<strong>Package:</strong> ${pkg || "n/a"}`,
    (total > 0 ? `<strong>Estimate:</strong> $${total.toFixed(2)} ${currency}` : ""),
    addons ? `<strong>Add-ons:</strong> ${addons}` : "",
    notesWithPricing ? `<strong>Notes:</strong> ${notesWithPricing}` : "",
    `<span style="color:#667085;font-size:12px;">Ref: ${bookingId}</span>`
  ].filter(Boolean);

  const htmlEmail = makeEmailHtml({
    title: "Detail’N Co. — Booking Approval Needed",
    lines,
    ctaPrimary: { label: "Approve", href: approveUrl },
    ctaSecondary: { label: "Reject", href: rejectUrl },
  });

  const textEmail = [
    "New booking request (pending hold).",
    `Date: ${date}`,
    `Start time: ${startTime}`,
    `Customer: ${name} (${email}${phone ? ` • ${phone}` : ""})`,
    `Location: ${location}`,
    `Vehicle: ${vehicle} (${vehicleSize || "n/a"})`,
    `Package: ${pkg || "n/a"}`,
    addons ? `Add-ons: ${addons}` : "",
    notesWithPricing ? `Notes: ${notesWithPricing}` : "",
    "",
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
    `Ref: ${bookingId}`,
  ].filter(Boolean).join("\n");

  try {
    await sendEmail(env, {
      to: [businessEmail],
      subject: `Booking request pending approval — ${date} ${startTime}`,
      text: textEmail,
      html: htmlEmail,
      fromName: "Detail’N Co.",
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Unknown email error";
    return json(
      { bookingId, warning: "Booking created, but email delivery failed.", emailError: msg },
      { status: 201 }
    );
  }

  return json({ bookingId }, { status: 201 });
}
