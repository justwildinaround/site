import { json, nowMs, randomToken, safeText, clampInt, getBaseUrl, sendEmailMailChannels, makeEmailHtml, formatBusinessHoursNote } from "./lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Server not configured: missing D1 binding DB." }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, { status: 400 });
  }

  const date = safeText(body.date, 20);              // YYYY-MM-DD
  const startTime = safeText(body.startTime, 10);    // HH:MM
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date." }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime)) return json({ error: "Invalid start time." }, { status: 400 });
  if (!durationMin || !startMs || !endMs || endMs <= startMs) return json({ error: "Invalid duration/timestamps." }, { status: 400 });
  if (!name || !email || !location || !vehicle) return json({ error: "Missing required fields." }, { status: 400 });

  const createdAt = nowMs();
  const expiresAt = createdAt + 45 * 60_000; // 45-minute soft hold
  const approveToken = randomToken(32);
  const rejectToken = randomToken(32);

  // Block if overlaps with any approved booking or non-expired pending hold on the same date.
  const overlap = await env.DB.prepare(
    `SELECT id, status FROM bookings
     WHERE date = ?
       AND status IN ('approved','pending')
       AND NOT (end_ms <= ? OR start_ms >= ?)
       AND (status = 'approved' OR (status = 'pending' AND expires_at_ms > ?))
     LIMIT 1`
  ).bind(date, startMs, endMs, createdAt).first();

  if (overlap) {
    return json({ error: "That time overlaps an existing booking/hold. Please pick another start time." }, { status: 409 });
  }

  const insert = await env.DB.prepare(
    `INSERT INTO bookings
     (date, start_time, duration_min, start_ms, end_ms, status, expires_at_ms,
      customer_name, customer_email, customer_phone,
      location, vehicle, vehicle_size, package, addons, notes,
      approve_token, reject_token, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    date, startTime, durationMin, startMs, endMs, expiresAt,
    name, email, phone,
    location, vehicle, vehicleSize, pkg, addons, notes,
    approveToken, rejectToken, createdAt, createdAt
  ).run();

  const bookingId = insert.meta?.last_row_id;
  if (!bookingId) return json({ error: "Failed to create booking." }, { status: 500 });

  const baseUrl = getBaseUrl(request, env);
  const businessEmail = (env.BUSINESS_EMAIL || "detailnco2@gmail.com").trim();

  const approveUrl = `${baseUrl}/api/bookings/approve?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${baseUrl}/api/bookings/reject?token=${encodeURIComponent(rejectToken)}`;

  const lines = [
    `<strong>New booking request (pending hold)</strong> — expires in 45 minutes.`,
    `<strong>Date:</strong> ${date} (${formatBusinessHoursNote(date)})`,
    `<strong>Requested:</strong> ${startTime} for ${durationMin} minutes`,
    `<strong>Customer:</strong> ${name} (${email}${phone ? ` • ${phone}` : ""})`,
    `<strong>Location:</strong> ${location}`,
    `<strong>Vehicle:</strong> ${vehicle} (${vehicleSize || "n/a"})`,
    `<strong>Package:</strong> ${pkg || "n/a"}`,
    addons ? `<strong>Add-ons:</strong> ${addons}` : "",
    notes ? `<strong>Notes:</strong> ${notes}` : "",
    `<span style="color:#667085;font-size:12px;">Ref: ${bookingId}</span>`
  ].filter(Boolean);

  const htmlEmail = makeEmailHtml({
    title: "Detail’N Co. — Booking Approval Needed",
    lines,
    ctaPrimary: { label: "Approve", href: approveUrl },
    ctaSecondary: { label: "Reject", href: rejectUrl }
  });

  const textEmail = [
    "New booking request (pending hold).",
    `Date: ${date}`,
    `Requested: ${startTime} for ${durationMin} minutes`,
    `Customer: ${name} (${email}${phone ? ` • ${phone}` : ""})`,
    `Location: ${location}`,
    `Vehicle: ${vehicle} (${vehicleSize || "n/a"})`,
    `Package: ${pkg || "n/a"}`,
    addons ? `Add-ons: ${addons}` : "",
    notes ? `Notes: ${notes}` : "",
    "",
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
    `Ref: ${bookingId}`
  ].filter(Boolean).join("\n");

  try {
    await sendEmailMailChannels(env, {
      to: [businessEmail],
      subject: `Booking request pending approval — ${date} ${startTime}`,
      text: textEmail,
      html: htmlEmail,
      fromName: "Detail’N Co."
    });
  } catch (e) {
    // Keep the booking; return success but warn.
    return json({
      bookingId,
      warning: "Booking created, but email delivery failed. Check MailChannels/domain settings."
    }, { status: 201 });
  }

  return json({ bookingId }, { status: 201 });
}
