import { json, safeText } from "../bookings/lib.js";

// GET /api/payments/quote?bookingId=...&token=...
// Returns minimal booking info + amount for the payment page.

const parseAmountFromNotes = (notes) => {
  const m = String(notes || "").match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
  const v = m ? Number(m[1]) : 0;
  return Number.isFinite(v) ? v : 0;
};

export async function onRequestGet({ request, env }) {
  if (!env.BOOKINGS_DB) return json({ error: "Server not configured: missing BOOKINGS_DB." }, { status: 500 });

  const url = new URL(request.url);
  const bookingId = Number(url.searchParams.get("bookingId") || "0");
  const token = safeText(url.searchParams.get("token"), 256);
  if (!bookingId || !token) return json({ error: "Missing bookingId/token." }, { status: 400 });

  const booking = await env.BOOKINGS_DB.prepare(
    `SELECT id, status, date, start_time, customer_name, customer_email, vehicle, location, package, addons, notes, total_cad, currency, pay_token
     FROM bookings WHERE id = ? LIMIT 1`
  ).bind(bookingId).first();

  if (!booking) return json({ error: "Booking not found." }, { status: 404 });
  if (String(booking.pay_token || "") !== token) return json({ error: "Invalid payment link." }, { status: 403 });
  if (String(booking.status) !== "approved") return json({ error: "This booking is not approved yet." }, { status: 400 });

  let total = Number(booking.total_cad || 0);
  if (!(total > 0)) total = parseAmountFromNotes(booking.notes);

  return json({
    booking: {
      id: booking.id,
      status: booking.status,
      date: booking.date,
      startTime: booking.start_time,
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      vehicle: booking.vehicle,
      location: booking.location,
      package: booking.package,
      addons: booking.addons,
      total,
      currency: booking.currency || "CAD",
    },
  });
}
