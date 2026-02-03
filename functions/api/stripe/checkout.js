export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { bookingId, payToken } = body || {};
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Server not configured." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    if (!bookingId || !payToken) {
      return new Response(JSON.stringify({ error: "Booking approval required before payment." }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const booking = await env.DB.prepare(
      `SELECT id, status, pay_token FROM bookings WHERE id = ? LIMIT 1`
    ).bind(Number(bookingId)).first();

    if (!booking || booking.status !== "approved" || booking.pay_token !== payToken) {
      return new Response(JSON.stringify({ error: "This payment link is invalid or the booking is not approved." }), {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    // TODO: replace with your real price table (source of truth)
    const PACKAGES = {
      select: { small: 8999, medium: 10999, large: 12499 },
      signature: { small: 13499, medium: 16499, large: 18299 },
      showroom: { small: 24999, medium: 29999, large: 33999 },
    };

    const ADDONS = {
      interior_rescent: 2500,
      smoke_odor: 6000,
      cabin_filter_clean: 500,
      engine_filter_clean: 1000,
      windshield_wax: 2000,
      bug_tar: 3000,
      tire_air: 500,
      engine_bay_clean: 5000,
    };

    const { packageKey, sizeKey, addonKeys = [] } = body || {};
    if (!PACKAGES[packageKey] || !PACKAGES[packageKey][sizeKey]) {
      return new Response("Invalid package/size", { status: 400 });
    }

    const base = PACKAGES[packageKey][sizeKey];
    const addonsTotal = addonKeys.reduce((sum, k) => sum + (ADDONS[k] || 0), 0);
    const total = base + addonsTotal;

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "payment",
        success_url: `${env.SITE_URL}/thank-you.html?provider=stripe`,
        cancel_url: `${env.SITE_URL}/addons.html`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][product_data][name]": `Detail’N Co. — ${packageKey.toUpperCase()} (${sizeKey}) + Add-ons`,
        "line_items[0][price_data][unit_amount]": String(total),
      }),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      return new Response(JSON.stringify(data), { status: 400 });
    }

    return new Response(JSON.stringify({ url: data.url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(e.message || "Stripe error", { status: 500 });
  }
}
