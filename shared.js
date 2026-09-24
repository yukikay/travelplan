const allowedKeys = new Set(['checks', 'todoPrefs', 'dayEdits', 'ledger']);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'D1 database binding DB is missing' }, 503);
  try {
    const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM shared_document').all();
    const documents = {};
    for (const row of results) {
      if (!allowedKeys.has(row.key)) continue;
      try { documents[row.key] = JSON.parse(row.value); } catch {}
    }
    return json({ documents });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not read shared data' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env.DB || !env.TRIP_ACCESS_CODE) return json({ error: 'D1 or access code is not configured' }, 503);
  if (request.headers.get('X-Trip-Code') !== env.TRIP_ACCESS_CODE) return json({ error: 'Incorrect access code' }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!payload || !allowedKeys.has(payload.key) || payload.value === undefined) return json({ error: 'Invalid shared document' }, 400);
  const value = JSON.stringify(payload.value);
  if (value.length > 250000) return json({ error: 'Shared document is too large' }, 413);
  try {
    await env.DB.prepare("INSERT INTO shared_document (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(payload.key, value).run();
    return json({ key: payload.key, updated: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not save shared data' }, 500);
  }
}
