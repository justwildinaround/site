// Shared helpers for booking endpoints (Cloudflare Pages Functions)

/* ---------------- RESPONSE HELPERS ---------------- */

export const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    },
    status: init.status || 200
  });

export const html = (content, init = {}) =>
  new Response(content, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init.headers || {})
    },
    status: init.status || 200
  });

/* ---------------- UTILITIES ---------------- */

export const nowMs = () => Date.now();

export const base64url = (bytes) => {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

  if (explicit) {
    return explicit.replace(/\/+$/g, "");
  }

  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
};

/* ---------------- EMAIL ---------------- */
// IMPORTANT (2024+): MailChannels' public/free relay was sunset. If you're getting a 401,
// you likely need a MailChannels Email API key (X-API-Key) OR switch to a provider like Resend.

export const sendEmail = async (env, message) => {
  const to = (message.to || []).filter(Boolean);
  if (!to.length) throw new Error("sendEmail: missing recipient(s)");

  // 1) Resend (recommended)
  // Env: RESEND_API_KEY, MAIL_FROM (must be verified sender/domain in Resend)
  if (env.RESEND_API_KEY) {
    const from = (env.MAIL_FROM || "bookings@detailnco.com").trim();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}`
      },
      body: JSON.stringify({
        from,
        to,
        subject: message.subject || "",
        text: message.text || "",
        ...(message.html ? { html: message.html } : {})
      })
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${body}`);
    return;
  }

  // 2) MailChannels Email API (requires key)
  // Env: MAILCHANNELS_API_KEY, MAIL_FROM
  const mcKey = env.MAILCHANNELS_API_KEY && String(env.MAILCHANNELS_API_KEY).trim();
  if (!mcKey) {
    throw new Error(
      "Email not configured. Set RESEND_API_KEY (recommended) or MAILCHANNELS_API_KEY."
    );
  }

  const fromEmail = (env.MAIL_FROM || "bookings@detailnco.com").trim();
  const fromName = (message.fromName || "Detail’N Co. Booking").trim();

  const payload = {
    from: { email: fromEmail, name: fromName },
    personalizations: [{ to: to.map((email) => ({ email })) }],
    subject: message.subject || "",
    content: [
      { type: "text/plain", value: message.text || "" },
      ...(message.html ? [{ type: "text/html", value: message.html }] : [])
    ]
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": mcKey
    },
    body: JSON.stringify(payload)
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`MailChannels send failed: ${res.status} ${body}`);
};

/* Backward compatibility */
export const sendEmailMailChannels = sendEmail;

/* ---------------- FORMATTING ---------------- */

export const formatBusinessHoursNote = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();

  const isWeekend = day === 0 || day === 6;

  return isWeekend
    ? "Booking Hours: 10:00am – 10:00pm"
    : "Booking Hours: 4:30pm – 10:00pm";
};

/* ---------------- EMAIL TEMPLATE ---------------- */

export const makeEmailHtml = ({ title, lines, ctaPrimary, ctaSecondary }) => {
  const lineHtml = lines
    .map(
      (l) =>
        `<div style="margin:0 0 10px;line-height:1.5;color:#101828;">${l}</div>`
    )
    .join("");

  const btn = (cta, color) =>
    cta
      ? `<a href="${cta.href}"
           style="
            display:inline-block;
            padding:12px 16px;
            border-radius:12px;
            text-decoration:none;
            font-weight:800;
            background:${color};
            color:white;
            margin-right:10px;">
          ${cta.label}
        </a>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:system-ui,Arial;">
    <div style="max-width:640px;margin:0 auto;padding:22px;">
      <div style="
        background:#fff;
        border-radius:18px;
        box-shadow:0 12px 34px rgba(16,24,40,.08);
        padding:18px;
        border:1px solid rgba(16,24,40,.08);">

        <div style="
          font-weight:900;
          font-size:16px;
          color:#101828;
          margin-bottom:12px;">
          ${title}
        </div>

        ${lineHtml}

        <div style="margin-top:16px;">
          ${btn(ctaPrimary, "#2F7DF6")}
          ${btn(ctaSecondary, "#FF4D4D")}
        </div>

        <div style="
          margin-top:14px;
          color:#667085;
          font-size:12px;">
          If buttons don’t work, copy/paste the link.
        </div>

      </div>
    </div>
  </body>
</html>`;
};

/* ---------------- APPROVAL PAGE ---------------- */

export const approvalPage = ({ title, body, ok }) => {
  const bar = ok ? "#2F7DF6" : "#FF4D4D";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>

<body style="
  margin:0;
  background:#0b0f17;
  color:white;
  font-family:system-ui,Arial;">

  <div style="max-width:760px;margin:0 auto;padding:28px;">

    <div style="
      border:1px solid rgba(255,255,255,.1);
      border-radius:18px;
      background:rgba(255,255,255,.04);
      overflow:hidden;">

      <div style="height:6px;background:${bar};"></div>

      <div style="padding:18px;">

        <h2>${title}</h2>

        <div style="line-height:1.6;color:#ccc;">
          ${body}
        </div>

      </div>
    </div>

  </div>
</body>
</html>`;
};
