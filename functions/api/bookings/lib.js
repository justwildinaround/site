// Shared helpers for booking endpoints (Cloudflare Pages Functions)

export const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
    status: init.status || 200,
  });

export const html = (content, init = {}) =>
  new Response(content, {
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers || {}) },
    status: init.status || 200,
  });

export const nowMs = () => Date.now();

export const base64url = (bytes) => {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const randomToken = (len = 32) => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

export const safeText = (v, max = 5000) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
};

export const clampInt = (v, min, max) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};

export const getBaseUrl = (request, env) => {
  const explicit = env.PUBLIC_BASE_URL && String(env.PUBLIC_BASE_URL).trim();
  if (explicit) return explicit.replace(/\/+$/g, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
};

// ---------- BUSINESS HOURS NOTE (matches your weekend/weekday rules) ----------
export const formatBusinessHoursNote = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0 sun .. 6 sat
  const isWeekend = day === 0 || day === 6;
  return isWeekend
    ? "Booking Hours for this day: 10:00am–10:00pm"
    : "Booking Hours for this day: 4:30pm–10:00pm";
};

// ---------- EMAIL HTML ----------
export const makeEmailHtml = ({ title, lines, ctaPrimary, ctaSecondary }) => {
  const lineHtml = (lines || [])
    .map((l) => `<div style="margin:0 0 10px;line-height:1.5;color:#101828;">${l}</div>`)
    .join("");

  const btn = (cta, color) =>
    cta
      ? `<a href="${cta.href}" style="display:inline-block;padding:12px 14px;border-radius:12px;text-decoration:none;font-weight:800;background:${color};color:white;margin-right:10px;">${cta.label}</a>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:22px;">
      <div style="background:#ffffff;border-radius:18px;box-shadow:0 12px 34px rgba(16,24,40,.08);padding:18px 18px 16px;border:1px solid rgba(16,24,40,.08);">
        <div style="font-weight:900;letter-spacing:.02em;font-size:16px;color:#101828;margin-bottom:10px;">${title}</div>
        ${lineHtml}
        <div style="margin-top:14px;">
          ${btn(ctaPrimary, "#2F7DF6")}
          ${btn(ctaSecondary, "#FF4D4D")}
        </div>
        <div style="margin-top:14px;color:#667085;font-size:12px;line-height:1.4;">
          If the buttons don’t work, copy/paste the link into your browser.
        </div>
      </div>
    </div>
  </body>
</html>`;
};

export const approvalPage = ({ title, body, ok }) => {
  const bar = ok ? "rgba(47,125,246,.85)" : "rgba(255,77,77,.88)";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;background:#0b0f17;color:rgba(255,255,255,.88);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:780px;margin:0 auto;padding:28px;">
    <div style="border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;background:rgba(255,255,255,.03);box-shadow: inset 0 1px 0 rgba(255,255,255,.04);">
      <div style="height:6px;background:${bar};"></div>
      <div style="padding:18px;">
        <div style="font-weight:900;letter-spacing:.02em;font-size:18px;margin-bottom:10px;">${title}</div>
        <div style="line-height:1.55;color:rgba(255,255,255,.78);">${body}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

// ---------- EMAIL SENDER (Resend) ----------
export const sendEmail = async (env, message) => {
  const apiKey = (env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("Missing RESEND_API_KEY env var.");

  // Backward-compatible alias (older files still import this name)
export const sendEmailMailChannels = sendEmail;


  const fromEmail = (env.MAIL_FROM || "").trim();
  if (!fromEmail) throw new Error("Missing MAIL_FROM env var (must be a verified sender in Resend).");

  const to = (message.to || []).map((email) => ({ email }));
  if (!to.length) throw new Error("No recipients provided.");

  const payload = {
    from: `${message.fromName || "Detail’N Co."} <${fromEmail}>`,
    to: (message.to || []),
    subject: message.subject || "",
    text: message.text || "",
    html: message.html || undefined,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${body}`);
};
