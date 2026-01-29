export interface Env {
  DB: D1Database;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function bad(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);

  // GET /api/reviews?limit=50
  if (request.method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

    const { results } = await env.DB
      .prepare("SELECT id, name, text, created_at FROM reviews ORDER BY created_at DESC LIMIT ?1")
      .bind(limit)
      .all();

    return json({ ok: true, reviews: results });
  }

  // POST /api/reviews
  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid JSON");
    }

    const name = String(body?.name || "").trim().slice(0, 40);
    const text = String(body?.text || "").trim().slice(0, 500);
    const ownerToken = String(body?.ownerToken || "").trim();

    if (!name) return bad("Name required");
    if (!text) return bad("Review required");
    if (!ownerToken || ownerToken.length < 16) return bad("Owner token missing");

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    await env.DB.prepare(
      "INSERT INTO reviews (id, name, text, created_at, owner_token) VALUES (?1, ?2, ?3, ?4, ?5)"
    )
      .bind(id, name, text, createdAt, ownerToken)
      .run();

    return json({ ok: true, id, created_at: createdAt });
  }

  // DELETE /api/reviews?id=...
  if (request.method === "DELETE") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return bad("Missing id");

    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const ownerToken = String(body?.ownerToken || "").trim();
    if (!ownerToken) return bad("Owner token missing");

    const row = await env.DB
      .prepare("SELECT owner_token FROM reviews WHERE id = ?1")
      .bind(id)
      .first<{ owner_token: string }>();

    if (!row) return bad("Not found", 404);
    if (row.owner_token !== ownerToken) return bad("Not allowed", 403);

    await env.DB.prepare("DELETE FROM reviews WHERE id = ?1").bind(id).run();
    return json({ ok: true });
  }

  return bad("Method not allowed", 405);
};
