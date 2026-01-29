export interface Env {
  DB: D1Database;
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    // GET reviews
    if (request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const { results } = await env.DB
        .prepare(
          `SELECT id, name, text, created_at, owner_token
           FROM reviews
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(limit)
        .all();

      return new Response(JSON.stringify(results), { headers });
    }

    // POST review
    if (request.method === "POST") {
      const { name, text, ownerToken } = await request.json();
      if (!name || !text || !ownerToken) {
        return new Response(JSON.stringify({ error: "Invalid input" }), {
          status: 400,
          headers,
        });
      }

      const id = crypto.randomUUID();
      const createdAt = Date.now();

      await env.DB
        .prepare(
          `INSERT INTO reviews (id, name, text, created_at, owner_token)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(id, name, text, createdAt, ownerToken)
        .run();

      return new Response(
        JSON.stringify({ id, created_at: createdAt }),
        { headers }
      );
    }

    // DELETE review
    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      const ownerToken = url.searchParams.get("ownerToken");

      if (!id || !ownerToken) {
        return new Response(JSON.stringify({ error: "Missing params" }), {
          status: 400,
          headers,
        });
      }

      const result = await env.DB
        .prepare(
          `DELETE FROM reviews
           WHERE id = ? AND owner_token = ?`
        )
        .bind(id, ownerToken)
        .run();

      return new Response(JSON.stringify({ deleted: result.changes > 0 }), {
        headers,
      });
    }

    return new Response("Method Not Allowed", { status: 405, headers });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Server error" }),
      { status: 500, headers }
    );
  }
};
