import { json, safeText } from "../bookings/lib.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.STRIPE_SECRET_KEY) {
      return json({ error: "Missing STRIPE_SECRET_KEY env var." }, { status: 500 });
    }
    if (!env.PUBLIC_BASE_URL) {
      return json({ error: "Missing PUBLIC_BASE_URL env var." }, { status: 500 });
    }
    if (!env.BOOKINGS_DB) {
      return json({ error: "Missing D1 binding BOOKINGS_DB." }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const payToken = safeText(body.payToken, 200);
    if (!payToken) return json({ error: "Missing payToken." }, { status: 400 });

    // Load booking (we expect total_cad + currency exist; pay_token exists from your schema)
    const row = await env.BOOKINGS_DB.prepare(
      `SELECT id, date, start_time, customer_email, customer_name,
              total_cad, currency
       FROM bookings
       WHERE pay_token = ?
       LIMIT 1`
    ).bind(payToken).first();

    if (!row) return json({ error: "Invalid pay token." }, { status: 404 });

    const totalCad = Number(row.total_cad || 0);
    if (!Number.isFinite(totalCad) || totalCad <= 0) {
      return json({ error: "Booking total is missing or invalid (total_cad must be > 0)." }, { status: 400 });
    }

    const amount = Math.round(totalCad * 100); // cents
    const currency = (row.currency || "CAD").toLowerCase();

    const base = String(env.PUBLIC_BASE_URL).replace(/\/+$/g, "");
    const successUrl = `${base}/payment-success.html?ref=${encodeURIComponent(row.id)}`;
    const cancelUrl = `${base}/payment-cancelled.html?ref=${encodeURIComponent(row.id)}`;

    // Create a Stripe Checkout Session via HTTPS (no stripe SDK)
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);

    // Customer email (optional but helps checkout)
    if (row.customer_email) params.set("customer_email", String(row.customer_email));

    // One line item with the booking total
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", currency);
    params.set("line_items[0][price_data][unit_amount]", String(amount));
    params.set("line_items[0][price_data][product_data][name]", "Detail’N Co. Booking Deposit/Payment");
    params.set(
      "line_items[0][price_data][product_data][description]",
      `Booking #${row.id} — ${row.date} ${row.start_time}`
    );

    // Metadata
    params.set("metadata[booking_id]", String(row.id));
    params.set("metadata[pay_token]", payToken);

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return json(
        { error: "Stripe session create failed.", stripeStatus: resp.status, stripeResponse: data },
        { status: 500 }
      );
    }

    return json({ url: data.url, id: data.id }, { status: 200 });
  } catch (e) {
    return json({ error: "Checkout failed.", details: String(e?.message || e) }, { status: 500 });
  }
}
