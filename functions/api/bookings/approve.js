import {
  html,
  json,
  nowMs,
  randomToken,
  safeText,
  getBaseUrl,
  makeEmailHtml,
  sendEmail,
} from "./lib.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.BOOKINGS_DB) {
      return html(
        `<h1 style="font-family:system-ui">Missing D1 binding: BOOKINGS_DB</h1>`,
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const token = safeText(url.searchParams.get("token"), 256);
    if (!token) {
      return html(
        `<h1 style="font-family:system-ui">Missing token.</h1>`,
        { status: 400 }
      );
    }

    // Find booking by approve token
    const row = await env.BOOKINGS_DB.prepare(
      `SELECT id, status, expires_at_ms, customer_email, customer_name, total_cad, currency, pay_token
       FROM bookings
       WHERE approve_token = ?
       LIMIT 1`
    ).bind(token).first();

    if (!row?.id) {
      return html(
        `<h1 style="font-family:system-ui">Invalid/expired approval link.</h1>`,
        { status: 404 }
      );
    }

    const bookingId = Number(row.id);
    const status = String(row.status || "");
    const now = nowMs();

    // If already rejected, don't allow approve
    if (status === "rejected") {
      return html(
        `<h1 style="font-family:system-ui">This booking was already rejected.</h1>`,
        { status: 409 }
      );
    }

    // If still pending but expired, block approve
    if (status === "pending") {
      const exp = Number(row.expires_at_ms || 0);
      if (exp && exp <= now) {
        return html(
          `<h1 style="font-family:system-ui">This hold expired. Ask the customer to book again.</h1>`,
          { status: 410 }
        );
      }
    }

    // Ensure pay_token exists (used by payments.html + payment endpoints)
    const payToken = row.pay_token ? String(row.pay_token) : randomToken(32);

    // Approve booking (idempotent if already approved)
    await env.BOOKINGS_DB.prepare(
      `UPDATE bookings
       SET status = 'approved',
           pay_token = COALESCE(pay_token, ?),
           approved_at_ms = COALESCE(approved_at_ms, ?),
           updated_at_ms = ?
       WHERE id = ?`
    ).bind(payToken, now, now, bookingId).run();

    const baseUrl = getBaseUrl(request, env);

    // IMPORTANT: send bookingId + token to payments page
    const payUrl = `${baseUrl}/payments.html?bookingId=${encodeURIComponent(
      bookingId
    )}&token=${encodeURIComponent(payToken)}`;

    // (Optional) email the customer the payment link
    const customerEmail = safeText(row.customer_email, 200);
    const customerName = safeText(row.customer_name, 120);

    if (customerEmail) {
      const total = Number(row.total_cad || 0);
      const currency = safeText(row.currency || "CAD", 8);

      const lines = [
        `<strong>Your booking was approved ✅</strong>`,
        total > 0
          ? `<strong>Amount:</strong> $${total.toFixed(2)} ${currency}`
          : `<strong>Amount:</strong> Confirmed by the business`,
        `Use the button below to complete payment.`,
      ];

      const htmlEmail = makeEmailHtml({
        title: "Detail’N Co. — Booking Approved",
        lines,
        ctaPrimary: { label: "Pay Now", href: payUrl },
      });

      const textEmail = [
        "Your booking was approved.",
        total > 0 ? `Amount: $${total.toFixed(2)} ${currency}` : `Amount: Confirmed by the business`,
        `Pay here: ${payUrl}`,
      ].join("\n");

      try {
        await sendEmail(env, {
          to: [customerEmail],
          subject: "Booking approved — complete payment",
          text: textEmail,
          html: htmlEmail,
          fromName: "Detail’N Co.",
        });
      } catch {
        // Don't fail approval if customer email fails
      }
    }

    // Redirect approver directly into payments page too
    return new Response(null, {
      status: 302,
      headers: { Location: payUrl },
    });
  } catch (err) {
    console.error("approve.js error", err);
    return html(
      `<h1 style="font-family:system-ui">Error</h1><p>Worker threw an exception while approving. Check logs.</p>`,
      { status: 500 }
    );
  }
}
