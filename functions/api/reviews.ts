export interface Env {
  DB: D1Database;
}

const OWNED_KEY = "detailnco_owned_reviews_v1";

function getOwnedIds() {
  try {
    return JSON.parse(localStorage.getItem(OWNED_KEY)) || [];
  } catch {
    return [];
  }
}

function addOwnedId(id) {
  const ids = getOwnedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(OWNED_KEY, JSON.stringify(ids));
  }
}

function isOwned(id) {
  return getOwnedIds().includes(id);
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, id, created_at: createdAt }), { status: 200, headers });
}

function bad(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const headers = { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" };

  // GET /api/reviews -> list latest
  if (request.method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

    const { results } = await env.DB
      .prepare("SELECT id, name, text, created_at FROM reviews ORDER BY created_at DESC LIMIT ?1")
      .bind(limit)
      .all();

    return new Response(JSON.stringify({ ok: true, reviews: results }), { status: 200, headers });
  }

  // POST /api/reviews -> create
  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
    }

    const name = String(body?.name || "").trim().slice(0, 40);
    const text = String(body?.text || "").trim().slice(0, 500);
    const ownerToken = String(body?.ownerToken || "").trim();

    if (!name) return new Response(JSON.stringify({ ok: false, error: "Name required" }), { status: 400, headers });
    if (!text) return new Response(JSON.stringify({ ok: false, error: "Review required" }), { status: 400, headers });
    if (!ownerToken || ownerToken.length < 16) {
      return new Response(JSON.stringify({ ok: false, error: "Owner token missing" }), { status: 400, headers });
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    await env.DB.prepare(
      "INSERT INTO reviews (id, name, text, created_at, owner_token) VALUES (?1, ?2, ?3, ?4, ?5)"
    )
      .bind(id, name, text, createdAt, ownerToken)
      .run();

    return new Response(JSON.stringify({ ok: true, id, created_at: createdAt }), { status: 200, headers });
  }

  // DELETE /api/reviews?id=...  (requires ownerToken in JSON body)
  if (request.method === "DELETE") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return new Response(JSON.stringify({ ok: false, error: "Missing id" }), { status: 400, headers });

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // allow empty, but then fail below
    }

    const ownerToken = String(body?.ownerToken || "").trim();
    if (!ownerToken) {
      return new Response(JSON.stringify({ ok: false, error: "Owner token missing" }), { status: 400, headers });
    }

    const row = await env.DB.prepare("SELECT owner_token FROM reviews WHERE id = ?1")
      .bind(id)
      .first<{ owner_token: string }>();

    if (!row) return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404, headers });
    if (row.owner_token !== ownerToken) {
      return new Response(JSON.stringify({ ok: false, error: "Not allowed" }), { status: 403, headers });
    }

    await env.DB.prepare("DELETE FROM reviews WHERE id = ?1").bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
};
