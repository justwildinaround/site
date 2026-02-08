import {
  html,
  nowMs,
  randomToken,
  safeText,
  getBaseUrl,
  sendEmail,
  makeEmailHtml,
  approvalPage,
} from "./lib.js";

export async function onRequestGet({ request, env }) {
  if (!env.BOOKINGS_DB) {
    return html(
      approvalPage({
        title: "Server not configured",
        body: "Missing D1 binding <code>BOOKINGS_DB</code>.",
        ok: false,
      }),
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const token = safeText(url.searchParams.get("token"), 256);

  if (!token) {
    return html(
      approvalPage({
        title: "Invalid approval link",
        body: "Missing approval token.",
        ok: false,
      }),
      { status: 400 }
    );
  }

  // Find booking by approve_token
  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT id, status, date, start_time, duration_min,
            customer_name, customer_email,
            location, vehicle, vehicle_size, package, addons, notes,
            total_cad, currency, pay_token
     FROM bookings
     WHERE approve_token = ?
     LIMIT 1`
  )
    .bind(token)
    .first();

  if (!booking) {
    return html(
      approvalPage({
        title: "Link expired or invalid",
        body: "We couldn’t find a booking for that approval link.",
        ok: false,
      }),
      { status: 404 }
    );
  }

  // If already handled, just show a nice page (no redirect)
  if (String(booking.status) === "rejected") {
    return html(
      approvalPage({
        title: "Already rejected",
        body: `Booking <strong>#${booking.id}</strong> was already rejected.`,
        ok: false,
      }),
      { status: 200 }
    );
  }

  if (String(booking.status) === "approved") {
    return html(
      approvalPage({
        title: "Already approved",
        body: `Booking <strong>#${booking.id}</strong> is already approved. If the customer needs payment info again, re-send from your inbox or contact them.`,
        ok: true,
      }),
      { status: 200 }
    );
  }

  // Approve booking + ensure pay_token exists
  const approvedAt = nowMs();
  const payToken = safeText(booking.pay_token, 256) || randomToken(24);

  await env.BOOKINGS_DB.prepare(
    `UPDATE bookings
     SET status = 'approved',
         approved_at_ms = ?,
         updated_at_ms = ?,
         expires_at_ms = NULL,
         pay_token = ?
     WHERE id = ?`
  )
    .bind(approvedAt, approvedAt, payToken, booking.id)
    .run();

  // Email customer payment info/link
  const baseUrl = getBaseUrl(request, env);
  const customerEmail = safeText(booking.customer_email, 160);

  // Customer payment portal (separate from /payments.html informational page)
  // We use /pay (served by pay.html) so your nav "Payments" page can remain informational.
  const paymentInfoUrl = `${baseUrl}/pay?bookingId=${encodeURIComponent(
    booking.id
  )}&token=${encodeURIComponent(payToken)}`;

  if (customerEmail) {
    const amount = Number(booking.total_cad || 0);
    const currency = safeText(booking.currency || "CAD", 8) || "CAD";
    const amountLine =
      amount > 0 ? `<strong>Amount:</strong> $${amount.toFixed(2)} ${currency}` : "";

    const lines = [
      `<strong>Your appointment has been approved ✅</strong>`,
      `<strong>Booking:</strong> #${booking.id} — ${booking.date} ${booking.start_time}`,
      `<strong>Name:</strong> ${safeText(booking.customer_name, 120)}`,
      amountLine,
      `<strong>Vehicle:</strong> ${safeText(booking.vehicle, 160)} ${
        booking.vehicle_size ? `(${safeText(booking.vehicle_size, 30)})` : ""
      }`,
      `<strong>Location:</strong> ${safeText(booking.location, 160)}`,
      booking.package ? `<strong>Package:</strong> ${safeText(booking.package, 60)}` : "",
      booking.addons ? `<strong>Add-ons:</strong> ${safeText(booking.addons, 300)}` : "",
      booking.notes ? `<strong>Notes:</strong> ${safeText(booking.notes, 2000)}` : "",
      `<hr style="border:0;border-top:1px solid rgba(16,24,40,.12);margin:14px 0;">`,
      `<strong>Payment options:</strong> Cash, e-Transfer (EMT), or Debit/Credit + PayPal online.`,
      `If you want to pay online (Debit/Credit or PayPal), use this secure page: <a href="${paymentInfoUrl}">${paymentInfoUrl}</a>`,
    ].filter(Boolean);

    const htmlEmail = makeEmailHtml({
      title: "Detail’N Co. — Booking Approved",
      lines,
      ctaPrimary: { label: "Pay Now", href: paymentInfoUrl },
      ctaSecondary: { label: "View site", href: `${baseUrl}/` },
    });

    const textEmail = [
      "Your appointment has been approved.",
      `Booking: #${booking.id} — ${booking.date} ${booking.start_time}`,
      amount > 0 ? `Amount: $${amount.toFixed(2)} ${currency}` : "",
      "",
      "Payment options: Cash, e-Transfer (EMT), or Debit/Credit + PayPal online.",
      `Online payment page: ${paymentInfoUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await sendEmail(env, {
        to: [customerEmail],
        subject: `Detail’N Co. — Booking Approved (#${booking.id})`,
        text: textEmail,
        html: htmlEmail,
        fromName: "Detail’N Co.",
      });
    } catch (e) {
      // Still show success page to you (approval happened),
      // but include note so you know email failed.
      const msg = e?.message ? String(e.message) : "Unknown email error";
      return html(
        approvalPage({
          title: "Approved — but customer email failed",
          body: `Booking <strong>#${booking.id}</strong> was approved, but emailing the customer failed.<br><br><code>${safeText(
            msg,
            800
          )}</code>`,
          ok: false,
        }),
        { status: 200 }
      );
    }
  }

  // ✅ IMPORTANT: return a confirmation page to YOU — no redirect to payments.
  return html(
    approvalPage({
      title: "Booking approved",
      body: `Booking <strong>#${booking.id}</strong> has been approved.<br><br>A payment email has been sent to the customer (if an email was provided).`,
      ok: true,
    }),
    { status: 200 }
  );
}
