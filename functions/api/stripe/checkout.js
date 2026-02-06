import Stripe from "stripe";
import { json, safeText, getBaseUrl } from "../bookings/lib.js";

// POST /api/stripe/checkout
// Body: { bookingId, token }
// Returns: { url }

export async function onRequestPost({ request, env }) {
  if (!env.BOOKINGS_DB) {
    return json({ error: "Server not configured: missing D1 binding BOOKINGS_DB." }, { status: 500 });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Server not configured: missing STRIPE_SECRET_KEY." }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingId = Number(body.bookingId || 0);
  const token = safeText(body.token, 200);
  if (!bookingId || !token) return json({ error: "Missing bookingId/token." }, { status: 400 });

  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT id, status, customer_email, customer_name, pay_token, total_cad, currency, notes
     FROM bookings WHERE id = ? LIMIT 1`
  ).bind(bookingId).first();

  if (!booking) return json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "approved") return json({ error: "Booking is not approved." }, { status: 409 });
  if (safeText(booking.pay_token, 200) !== token) return json({ error: "Invalid token." }, { status: 401 });

  // Prefer stored total_cad; fallback to parsing "Estimate: $X.XX" from notes for older rows.
  let amountCad = Number(booking.total_cad || 0);
  if (!Number.isFinite(amountCad) || amountCad <= 0) {
    const m = String(booking.notes || "").match(/Estimate:\s*\$([0-9]+(?:\.[0-9]{2})?)/i);
    if (m) amountCad = Number(m[1]);
  }
  if (!Number.isFinite(amountCad) || amountCad <= 0) {
    return json({ error: "Booking has no payable total." }, { status: 400 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const baseUrl = getBaseUrl(request, env);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: safeText(booking.customer_email, 180) || undefined,
    line_items: [
      {
        price_data: {
          currency: "cad",
          product_data: {
            name: "Detail’N Co. — Booking Deposit/Payment",
            description: `Booking #${booking.id}`
          },
          unit_amount: Math.round(amountCad * 100)
        },
        quantity: 1
      }
    ],
    metadata: { bookingId: String(booking.id) },
    success_url: `${baseUrl}/payments.html?booking=${encodeURIComponent(String(booking.id))}&token=${encodeURIComponent(token)}&status=success`,
    cancel_url: `${baseUrl}/payments.html?booking=${encodeURIComponent(String(booking.id))}&token=${encodeURIComponent(token)}&status=cancel`
  });

  return json({ url: session.url }, { status: 200 });
}
