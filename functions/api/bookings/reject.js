import { html, nowMs, safeText, sendEmailMailChannels, makeEmailHtml, approvalPage } from "./lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.BOOKINGS_DB) return html(approvalPage({ title: "Server not configured", body: "Missing DB binding.", ok: false }), { status: 500 });

  const url = new URL(request.url);
  const token = safeText(url.searchParams.get("token"), 200);
  if (!token) return html(approvalPage({ title: "Invalid link", body: "Missing token.", ok: false }), { status: 400 });

  const now = nowMs();
  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT * FROM bookings WHERE reject_token = ? LIMIT 1`
  ).bind(token).first();

  if (!booking) {
    return html(approvalPage({ title: "Link expired or already used", body: "This rejection link is no longer valid.", ok: false }), { status: 410 });
  }

  if (booking.status !== "pending") {
    return html(approvalPage({ title: "Already handled", body: `This request is already <strong>${booking.status}</strong>.`, ok: booking.status === "approved" }), { status: 200 });
  }

  await env.BOOKINGS_DB.prepare(
    `UPDATE bookings SET status='rejected', approve_token=NULL, reject_token=NULL, updated_at_ms=? WHERE id=?`
  ).bind(now, booking.id).run();

  // Customer rejection email
  try {
    await sendEmailMailChannels(env, {
      to: [booking.customer_email],
      subject: `Booking request rejected — ${booking.date} ${booking.start_time}`,
      text:
        `Your booking request wasn’t approved for that time.\n\n` +
        `Requested: ${booking.date} ${booking.start_time} (duration to be confirmed)\n\n` +
        `Please try another time slot on the booking page or message us on Instagram.\n\n` +
        `— Detail’N Co.`,
      html: makeEmailHtml({
        title: "Detail’N Co. — Booking Not Approved",
        lines: [
          "Your booking request wasn’t approved for that time.",
          `<strong>Requested:</strong> ${booking.date} ${booking.start_time} (duration to be confirmed)`,
          "Please try another slot on the booking page or message us on Instagram."
        ]
      })
    });
  } catch {}

  return html(approvalPage({
    title: "Rejected ❌",
    body: "This booking request has been rejected. The slot is now free again, and the customer has been emailed.",
    ok: false
  }));
}
