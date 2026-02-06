export interface Env {
  DB: D1Database;
  ADMIN_KEY?: string; // set in Cloudflare Pages env vars
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Owner-Token, X-Admin-Key",
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

function getOwnerToken(req: Request) {
  return (req.headers.get("X-Owner-Token") || "").trim();
}

function isAdmin(req: Request, env: Env) {
  const configured = (env.ADMIN_KEY || "").trim();
  if (!configured) return false; // admin disabled if not set
  const provided = (req.headers.get("X-Admin-Key") || "").trim();
  return provided && provided === configured;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);

  try {
    // GET /api/reviews?limit=50
    if (request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
      const ownerToken = getOwnerToken(request);
      const admin = isAdmin(request, env);

      const { results } = await env.DB
        .prepare("SELECT id, name, text, created_at, owner_token FROM reviews ORDER BY created_at DESC LIMIT ?1")
        .bind(limit)
        .all();

      const reviews = (results || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        text: r.text,
        created_at: r.created_at,
        can_delete: !!ownerToken && r.owner_token === ownerToken,
        can_admin_delete: admin,
      }));

      return json({ ok: true, reviews, is_admin: admin });
    }

    // POST /api/reviews
    if (request.method === "POST") {
      const ownerToken = getOwnerToken(request);
      if (!ownerToken || ownerToken.length < 16) return bad("Missing owner token", 401);

      let body: any;
      try {
        body = await request.json();
      } catch {
        return bad("Invalid JSON");
      }

      const name = String(body?.name || "").trim().slice(0, 40);
      const text = String(body?.text || "").trim().slice(0, 500);

      if (!name) return bad("Name required");
      if (!text) return bad("Review required");

      const id = crypto.randomUUID();
      const createdAt = Date.now();

      await env.DB
        .prepare("INSERT INTO reviews (id, name, text, created_at, owner_token) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(id, name, text, createdAt, ownerToken)
        .run();

      return json({ ok: true, id, created_at: createdAt });
    }

    // DELETE /api/reviews?id=...
    if (request.method === "DELETE") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return bad("Missing id");

      const admin = isAdmin(request, env);
      const ownerToken = getOwnerToken(request);

      if (!admin && (!ownerToken || ownerToken.length < 16)) {
        return bad("Missing owner token", 401);
      }

      // Admin can delete anything. Non-admin can only delete own.
      const stmt = admin
        ? env.DB.prepare("DELETE FROM reviews WHERE id = ?1").bind(id)
        : env.DB.prepare("DELETE FROM reviews WHERE id = ?1 AND owner_token = ?2").bind(id, ownerToken);

      const result = await stmt.run();
      const deleted = (result as any)?.meta?.changes ? (result as any).meta.changes > 0 : false;
      if (!deleted) return bad("Not allowed or not found", 403);

      return json({ ok: true });
    }

    return bad("Method not allowed", 405);
  } catch (e: any) {
    return bad(e?.message || "Server error", 500);
  }
};
