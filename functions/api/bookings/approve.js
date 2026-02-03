import { html, json, nowMs, safeText, getBaseUrl, sendEmail, makeEmailHtml, approvalPage } from "./lib.js";

const makeToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};


export async function onRequestGet({ request, env }) {
  if (!env.BOOKINGS_DB) return html(approvalPage({ title: "Server not configured", body: "Missing BOOKINGS_DB binding.", ok: false }), { status: 500 });

  const url = new URL(request.url);
  const token = safeText(url.searchParams.get("token"), 200);
  if (!token) return html(approvalPage({ title: "Invalid link", body: "Missing token.", ok: false }), { status: 400 });

  const now = nowMs();
  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT * FROM bookings WHERE approve_token = ? LIMIT 1`
  ).bind(token).first();

  if (!booking) {
    return html(approvalPage({ title: "Link expired or already used", body: "This approval link is no longer valid.", ok: false }), { status: 410 });
  }

  if (booking.status !== "pending") {
    return html(approvalPage({ title: "Already handled", body: `This request is already <strong>${booking.status}</strong>.`, ok: booking.status === "approved" }), { status: 200 });
  }

  if (booking.expires_at_ms && booking.expires_at_ms <= now) {
    await env.BOOKINGS_DB.prepare(
      `UPDATE bookings SET status='expired', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
    ).bind(now, booking.id).run();

    return html(approvalPage({
      title: "Hold expired",
      body: "This request expired (45-minute hold). The slot is free again.",
      ok: false
    }), { status: 410 });
  }

  // Re-check overlap with existing APPROVED bookings (race safety).
  const db = env.BOOKINGS_DB;

  const overlap = await db.prepare(
    `SELECT id FROM bookings
     WHERE date = ?
       AND status = 'approved'
       AND id != ?
       AND NOT (end_ms <= ? OR start_ms >= ?)
     LIMIT 1`
  ).bind(booking.date, booking.id, booking.start_ms, booking.end_ms).first();

  if (overlap) {
    await env.BOOKINGS_DB.prepare(
      `UPDATE bookings SET status='rejected', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
    ).bind(now, booking.id).run();

    // Notify customer (optional but helpful)
    try {
      await sendEmail(env, {
        to: [booking.customer_email],
        subject: `Booking request not available — ${booking.date} ${booking.start_time}`,
        text:
          `Sorry — that time was taken before we could confirm.\n\n` +
          `Requested: ${booking.date} ${booking.start_time} (duration to be confirmed)\n\n` +
          `Please try another time slot on the booking page.`,
        html: makeEmailHtml({
          title: "Detail’N Co. — Time no longer available",
          lines: [
            "Sorry — that time was taken before we could confirm.",
            `<strong>Requested:</strong> ${booking.date} ${booking.start_time} (duration to be confirmed)`,
            "Please try another time on the booking page."
          ]
        })
      });
    } catch {}
    return html(approvalPage({ title: "Conflict", body: "That time was already approved for another booking. This request was rejected and the customer was notified.", ok: false }), { status: 409 });
  }
  const payToken = makeToken();

  await env.BOOKINGS_DB.prepare(
    `UPDATE bookings SET status='approved', approve_token=NULL, reject_token=NULL, pay_token=?, updated_at_ms=? WHERE id=?`
  ).bind(payToken, now, booking.id).run();

  // Customer confirmation email
  try {
    const baseUrl = getBaseUrl(request, env);
    const payLink = `${baseUrl}/addons.html?booking=${booking.id}&token=${payToken}`;
    await sendEmail(env, {
      to: [booking.customer_email],
      subject: `Booking approved ✅ — ${booking.date} ${booking.start_time}`,
      text:
        `Your booking request has been approved.\n\n` +
        `Pay here (after approval): ${payLink}\n\n` +
        `Date: ${booking.date}\n` +
        `Time: ${booking.start_time}\n` +
                `Location: ${booking.location}\n` +
        `Vehicle: ${booking.vehicle}\n` +
        `Package: ${booking.package}\n\n` +
        `If anything changes, reply to this email or reach out via Instagram.\n\n` +
        `— Detail’N Co.`,
      html: makeEmailHtml({
        title: "Detail’N Co. — Booking Approved ✅",
        lines: [
          "Your booking request has been approved.",
          `<strong>Payment:</strong> <a href="${payLink}">Pay for your package & add-ons</a>`,
          `<strong>Date:</strong> ${booking.date}`,
          `<strong>Time:</strong> ${booking.start_time}`,
                    `<strong>Location:</strong> ${booking.location}`,
          `<strong>Vehicle:</strong> ${booking.vehicle}`,
          `<strong>Package:</strong> ${booking.package}`,
          booking.addons ? `<strong>Add-ons:</strong> ${booking.addons}` : "",
          booking.notes ? `<strong>Notes:</strong> ${booking.notes}` : "",
          `<span style="color:#667085;font-size:12px;">Need changes? Reply to this email or message Instagram.</span>`
        ].filter(Boolean),
        ctaPrimary: { label: "Pay now", href: payLink }
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
