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

    // Same pricing table (source of truth)
    const PACKAGES = {
      select: { small: 89.99, medium: 109.99, large: 124.99 },
      signature: { small: 134.99, medium: 164.99, large: 182.99 },
      showroom: { small: 249.99, medium: 299.99, large: 339.99 },
    };

    const ADDONS = {
      interior_rescent: 25,
      smoke_odor: 60,
      cabin_filter_clean: 5,
      engine_filter_clean: 10,
      windshield_wax: 20,
      bug_tar: 30,
      tire_air: 5,
      engine_bay_clean: 50,
    };

    const { packageKey, sizeKey, addonKeys = [] } = body || {};
    if (!PACKAGES[packageKey] || typeof PACKAGES[packageKey][sizeKey] !== "number") {
      return new Response("Invalid package/size", { status: 400 });
    }

    const base = PACKAGES[packageKey][sizeKey];
    const addonsTotal = addonKeys.reduce((sum, k) => sum + (ADDONS[k] || 0), 0);
    const total = (base + addonsTotal).toFixed(2);

    // Get PayPal access token
    const tokenRes = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return new Response(JSON.stringify(tokenData), { status: 400 });

    const orderRes = await fetch(`${env.PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "CAD", value: total },
          description: `Detail’N Co. — ${packageKey.toUpperCase()} (${sizeKey}) + Add-ons`,
        }],
        application_context: {
          return_url: `${env.SITE_URL}/thank-you.html?provider=paypal`,
          cancel_url: `${env.SITE_URL}/addons.html`,
        },
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) return new Response(JSON.stringify(orderData), { status: 400 });

    const approve = (orderData.links || []).find(l => l.rel === "approve");
    return new Response(JSON.stringify({ approveUrl: approve?.href || "" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(e.message || "PayPal error", { status: 500 });
  }
}
