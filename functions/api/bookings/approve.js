import {
  html,
  nowMs,
  safeText,
  getBaseUrl,
  sendEmail,
  makeEmailHtml,
  approvalPage
} from "./lib.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.BOOKINGS_DB) {
      return html(
        approvalPage({ title: "Server not configured", body: "Missing BOOKINGS_DB binding.", ok: false }),
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const token = safeText(url.searchParams.get("token"), 200);
    if (!token) {
      return html(
        approvalPage({ title: "Invalid link", body: "Missing token.", ok: false }),
        { status: 400 }
      );
    }

    const booking = await env.BOOKINGS_DB
      .prepare(`SELECT * FROM bookings WHERE approve_token = ? LIMIT 1`)
      .bind(token)
      .first();

    if (!booking) {
      return html(
        approvalPage({ title: "Invalid link", body: "Booking not found or already processed.", ok: false }),
        { status: 404 }
      );
    }

    const now = nowMs();

    // Expired pending hold
    if (booking.status === "pending" && booking.expires_at_ms && Number(booking.expires_at_ms) <= now) {
      await env.BOOKINGS_DB
        .prepare(
          `UPDATE bookings
           SET status='expired', approve_token=NULL, reject_token=NULL, updated_at_ms=?
           WHERE id=?`
        )
        .bind(now, booking.id)
        .run();

      return html(
        approvalPage({ title: "Hold expired", body: "This booking hold expired. Ask the customer to pick another time.", ok: false }),
        { status: 200 }
      );
    }

    // Already processed
    if (booking.status !== "pending") {
      return html(
        approvalPage({ title: "Already processed", body: `This booking is already "${booking.status}".`, ok: true }),
        { status: 200 }
      );
    }

    // Approve + generate a pay token
    const payToken = crypto.randomUUID().replace(/-/g, "");
    const baseUrl = getBaseUrl(request, env);

    await env.BOOKINGS_DB
      .prepare(
        `UPDATE bookings
         SET status='approved',
             approve_token=NULL,
             reject_token=NULL,
             pay_token=?,
             updated_at_ms=?
         WHERE id=?`
      )
      .bind(payToken, now, booking.id)
      .run();

    const payLink = `${baseUrl}/addons.html?booking=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(payToken)}`;

    // Send emails — DO NOT crash if Resend refuses (common when domain is still "Pending")
    let emailWarning = "";

    const businessEmail = (env.BUSINESS_EMAIL || "").trim();
    const customerEmail = safeText(booking.customer_email, 200);

    // Email customer payment link
    try {
      if (customerEmail) {
        await sendEmail(env, {
          to: [customerEmail],
          subject: `Your booking is approved — payment link`,
          text: `Your booking was approved.\n\nPay here:\n${payLink}\n\nRef: ${booking.id}`,
          html: makeEmailHtml({
            title: "Detail’N Co. — Booking Approved",
            lines: [
              `Your booking has been <strong>approved</strong>.`,
              `Pay your deposit / confirm here: <a href="${payLink}">${payLink}</a>`,
              `<span style="color:#667085;font-size:12px;">Ref: ${booking.id}</span>`
            ],
            ctaPrimary: { label: "Open Payment Link", href: payLink }
          })
        });
      }
    } catch (e) {
      emailWarning += `<p><strong>Warning:</strong> Customer email could not be delivered yet (Resend still pending / restricted). Payment link is below.</p>`;
      console.error("Customer email send failed:", e);
    }

    // Optional: notify business
    try {
      if (businessEmail) {
        await sendEmail(env, {
          to: [businessEmail],
          subject: `Booking approved — Ref ${booking.id}`,
          text: `Booking approved.\nPayment link:\n${payLink}\nRef: ${booking.id}`,
          html: makeEmailHtml({
            title: "Detail’N Co. — Booking Approved",
            lines: [
              `Booking <strong>${booking.id}</strong> approved.`,
              `Payment link: <a href="${payLink}">${payLink}</a>`
            ],
            ctaPrimary: { label: "Open Payment Link", href: payLink }
          })
        });
      }
    } catch (e) {
      // never fail approval page
      console.error("Business email send failed:", e);
    }

    // Show success page regardless
    return html(
      approvalPage({
        title: "Approved ✅",
        ok: true,
        body: `
          ${emailWarning}
          <p><strong>Booking approved.</strong></p>
          <p>Payment link:</p>
          <p><a href="${payLink}">${payLink}</a></p>
          <p style="opacity:.8">Ref: ${booking.id}</p>
        `
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("approve.js fatal:", err);
    return html(
      approvalPage({ title: "Error", body: "Worker threw an exception while approving. Check logs.", ok: false }),
      { status: 500 }
    );
  }
}
