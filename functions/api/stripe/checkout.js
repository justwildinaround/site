import { json, safeText } from "../bookings/lib.js";

/**
 * POST /api/stripe/checkout
 * Body: { bookingId, token }
 * - bookingId = numeric booking id
 * - token = pay_token stored on the booking row
 * Returns: { url } (Stripe Checkout Session URL)
 */
export async function onRequestPost({ request, env }) {
  try {
    if (!env.STRIPE_SECRET_KEY) return json({ error: "Missing STRIPE_SECRET_KEY env var." }, { status: 500 });
    if (!env.PUBLIC_BASE_URL) return json({ error: "Missing PUBLIC_BASE_URL env var." }, { status: 500 });
    if (!env.BOOKINGS_DB) return json({ error: "Missing D1 binding BOOKINGS_DB." }, { status: 500 });

    const body = await request.json().catch(() => ({}));

    const bookingId = Number(body.bookingId || 0);
    const token = safeText(body.token, 256);

    if (!bookingId || !token) {
      return json({ error: "Missing bookingId/token." }, { status: 400 });
    }

    // Load booking + validate pay token + approved status
    const row = await env.BOOKINGS_DB.prepare(
      `SELECT id, status, date, start_time, customer_email, customer_name, total_cad, currency, pay_token
       FROM bookings
       WHERE id = ?
       LIMIT 1`
    ).bind(bookingId).first();

    if (!row) return json({ error: "Booking not found." }, { status: 404 });
    if (String(row.pay_token || "") !== token) return json({ error: "Invalid payment link." }, { status: 403 });
    if (String(row.status || "") !== "approved") return json({ error: "This booking is not approved yet." }, { status: 400 });

    const totalCad = Number(row.total_cad || 0);
    if (!Number.isFinite(totalCad) || totalCad <= 0) {
      return json({ error: "Booking total is missing or invalid (total_cad must be > 0)." }, { status: 400 });
    }

    const amount = Math.round(totalCad * 100); // cents
    const currency = String(row.currency || "CAD").toLowerCase();

    const base = String(env.PUBLIC_BASE_URL).replace(/\/+$/g, "");
    // Send them BACK to the same payments page so your UI shows status
    const successUrl = `${base}/payments.html?booking=${encodeURIComponent(row.id)}&token=${encodeURIComponent(token)}&status=success`;
    const cancelUrl  = `${base}/payments.html?booking=${encodeURIComponent(row.id)}&token=${encodeURIComponent(token)}&status=cancelled`;

    // Create a Stripe Checkout Session via HTTPS (no Stripe SDK)
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);

    if (row.customer_email) params.set("customer_email", String(row.customer_email));

    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", currency);
    params.set("line_items[0][price_data][unit_amount]", String(amount));
    params.set("line_items[0][price_data][product_data][name]", "Detail’N Co. — Booking Payment");
    params.set(
      "line_items[0][price_data][product_data][description]",
      `Booking #${row.id} — ${row.date} ${row.start_time}`
    );

    params.set("metadata[booking_id]", String(row.id));
    params.set("metadata[pay_token]", token);

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return json(
        { error: "Stripe session create failed.", stripeStatus: resp.status, stripeResponse: data },
        { status: 500 }
      );
    }

    if (!data?.url) {
      return json({ error: "Stripe did not return a checkout URL.", stripeResponse: data }, { status: 500 });
    }

    return json({ url: data.url }, { status: 200 });
  } catch (e) {
    return json({ error: "Checkout failed.", details: String(e?.message || e) }, { status: 500 });
  }
}
