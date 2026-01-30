import { html, json, nowMs, safeText, getBaseUrl, sendEmailMailChannels, makeEmailHtml, approvalPage } from "./lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return html(approvalPage({ title: "Server not configured", body: "Missing DB binding.", ok: false }), { status: 500 });

  const url = new URL(request.url);
  const token = safeText(url.searchParams.get("token"), 200);
  if (!token) return html(approvalPage({ title: "Invalid link", body: "Missing token.", ok: false }), { status: 400 });

  const now = nowMs();
  const booking = await env.DB.prepare(
    `SELECT * FROM bookings WHERE approve_token = ? LIMIT 1`
  ).bind(token).first();

  if (!booking) {
    return html(approvalPage({ title: "Link expired or already used", body: "This approval link is no longer valid.", ok: false }), { status: 410 });
  }

  if (booking.status !== "pending") {
    return html(approvalPage({ title: "Already handled", body: `This request is already <strong>${booking.status}</strong>.`, ok: booking.status === "approved" }), { status: 200 });
  }

  if (booking.expires_at_ms && booking.expires_at_ms <= now) {
    await env.DB.prepare(
      `UPDATE bookings SET status='expired', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
    ).bind(now, booking.id).run();

    return html(approvalPage({
      title: "Hold expired",
      body: "This request expired (45-minute hold). The slot is free again.",
      ok: false
    }), { status: 410 });
  }

  // Re-check overlap with existing APPROVED bookings (race safety).
  const overlap = await env.DB.prepare(
    `SELECT id FROM bookings
     WHERE date = ?
       AND status = 'approved'
       AND id != ?
       AND NOT (end_ms <= ? OR start_ms >= ?)
     LIMIT 1`
  ).bind(booking.date, booking.id, booking.start_ms, booking.end_ms).first();

  if (overlap) {
    await env.DB.prepare(
      `UPDATE bookings SET status='rejected', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
    ).bind(now, booking.id).run();

    // Notify customer (optional but helpful)
    try {
      await sendEmailMailChannels(env, {
        to: [booking.customer_email],
        subject: `Booking request not available — ${booking.date} ${booking.start_time}`,
        text:
          `Sorry — that time was taken before we could confirm.\n\n` +
          `Requested: ${booking.date} ${booking.start_time} for ${booking.duration_min} minutes\n\n` +
          `Please try another time slot on the booking page.`,
        html: makeEmailHtml({
          title: "Detail’N Co. — Time no longer available",
          lines: [
            "Sorry — that time was taken before we could confirm.",
            `<strong>Requested:</strong> ${booking.date} ${booking.start_time} for ${booking.duration_min} minutes`,
            "Please try another time on the booking page."
          ]
        })
      });
    } catch {}
    return html(approvalPage({ title: "Conflict", body: "That time was already approved for another booking. This request was rejected and the customer was notified.", ok: false }), { status: 409 });
  }

  await env.DB.prepare(
    `UPDATE bookings SET status='approved', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
  ).bind(now, booking.id).run();

  // Customer confirmation email
  try {
    const baseUrl = getBaseUrl(request, env);
    await sendEmailMailChannels(env, {
      to: [booking.customer_email],
      subject: `Booking approved ✅ — ${booking.date} ${booking.start_time}`,
      text:
        `Your booking request has been approved.\n\n` +
        `Date: ${booking.date}\n` +
        `Time: ${booking.start_time}\n` +
        `Duration: ${booking.duration_min} minutes\n\n` +
        `Location: ${booking.location}\n` +
        `Vehicle: ${booking.vehicle}\n` +
        `Package: ${booking.package}\n\n` +
        `If anything changes, reply to this email or reach out via Instagram.\n\n` +
        `— Detail’N Co.`,
      html: makeEmailHtml({
        title: "Detail’N Co. — Booking Approved ✅",
        lines: [
          "Your booking request has been approved.",
          `<strong>Date:</strong> ${booking.date}`,
          `<strong>Time:</strong> ${booking.start_time}`,
          `<strong>Duration:</strong> ${booking.duration_min} minutes`,
          `<strong>Location:</strong> ${booking.location}`,
          `<strong>Vehicle:</strong> ${booking.vehicle}`,
          `<strong>Package:</strong> ${booking.package}`,
          booking.addons ? `<strong>Add-ons:</strong> ${booking.addons}` : "",
          booking.notes ? `<strong>Notes:</strong> ${booking.notes}` : "",
          `<span style="color:#667085;font-size:12px;">Need changes? Reply to this email or message Instagram.</span>`
        ].filter(Boolean),
        ctaPrimary: { label: "View site", href: baseUrl }
      })
    });
  } catch (e) {
    // If email fails, approval still stands.
  }

  return html(approvalPage({
    title: "Approved ✅",
    body: "This booking has been approved. The slot is now locked on the site, and the customer has been emailed.",
    ok: true
  }));
}
