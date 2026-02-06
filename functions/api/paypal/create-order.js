import { json, safeText, getBaseUrl } from "../bookings/lib.js";

// POST /api/paypal/create-order
// Body: { bookingId, token }
// Returns: { orderId, approveUrl }

export async function onRequestPost({ request, env }) {
  if (!env.BOOKINGS_DB) return json({ error: "Server not configured: missing BOOKINGS_DB." }, { status: 500 });
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET || !env.PAYPAL_API_BASE) {
    return json({ error: "Server not configured: missing PAYPAL_CLIENT_ID/PAYPAL_SECRET/PAYPAL_API_BASE." }, { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const bookingId = Number(body.bookingId || 0);
  const token = safeText(body.token, 200);
  if (!bookingId || !token) return json({ error: "Missing bookingId/token." }, { status: 400 });

  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT id, status, pay_token, total_cad, currency, notes
     FROM bookings WHERE id = ? LIMIT 1`
  ).bind(bookingId).first();

  if (!booking) return json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "approved") return json({ error: "Booking is not approved." }, { status: 409 });
  if (String(booking.pay_token || "") !== token) return json({ error: "Invalid token." }, { status: 403 });

  let total = Number(booking.total_cad || 0);
  if (!(total > 0)) {
    const m = String(booking.notes || "").match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
    if (m) total = Number(m[1]);
  }
  if (!(total > 0)) return json({ error: "No payable amount on this booking." }, { status: 400 });

  const baseUrl = getBaseUrl(request, env);
  const returnUrl = `${baseUrl}/payments.html?booking=${encodeURIComponent(String(bookingId))}&token=${encodeURIComponent(token)}&status=paypal_success`;
  const cancelUrl = `${baseUrl}/payments.html?booking=${encodeURIComponent(String(bookingId))}&token=${encodeURIComponent(token)}&status=paypal_cancel`;

  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);

  const res = await fetch(`${env.PAYPAL_API_BASE.replace(/\/+$/g, "")}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `booking_${bookingId}`,
        amount: { currency_code: "CAD", value: total.toFixed(2) }
      }],
      application_context: {
        brand_name: "Detail'N Co.",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl
      }
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return json({ error: "PayPal order create failed.", details: data }, { status: 502 });
  }

  const approveUrl = (data?.links || []).find((l) => l.rel === "approve")?.href || "";
  return json({ orderId: data.id, approveUrl });
}
