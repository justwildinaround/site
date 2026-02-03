import { json, safeText, sendEmail } from "./lib.js";

// GET /api/bookings/email-test?key=ADMIN_KEY&to=you@example.com
// Sends a test email through Resend. Protected by ADMIN_KEY to prevent abuse.

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);

  const provided = safeText(u.searchParams.get("key"), 200);
  const expected = safeText(env.ADMIN_KEY || "", 200);

  if (!expected || provided !== expected) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = safeText(u.searchParams.get("to") || env.BUSINESS_EMAIL || "", 200);
  if (!to || !to.includes("@")) {
    return json({ error: "Provide ?to=email (or set BUSINESS_EMAIL)" }, { status: 400 });
  }

  await sendEmail(env, {
    to: [to],
    subject: "Detail’N Co. — email test",
    text: "Resend email test successful.",
    html: "<p>Resend email test successful.</p>",
    fromName: "Detail’N Co."
  });

  return json({ ok: true, to });
}
