const allowed = new Set([
  'todo:todo-passports', 'todo:todo-bookings', 'todo:todo-sim',
  'todo:todo-cash', 'todo:todo-hkg-bags', 'todo:todo-rome-transfer',
  'todo:todo-florence-bag', 'todo:todo-swiss-weather',
  'ticket:ticket-train-9520', 'ticket:ticket-train-9400',
  'ticket:ticket-train-9713', 'ticket:ticket-train-ec60',
  'ticket:ticket-colosseum', 'ticket:ticket-vatican',
  'ticket:ticket-florence-duomo', 'ticket:ticket-venice-palace',
  'ticket:ticket-milan-duomo', 'ticket:ticket-grindelwald-first',
  'ticket:ticket-matterhorn', 'ticket:ticket-thun-cruise'
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'D1 database binding DB is missing' }, 503);
  try {
    const { results } = await env.DB.prepare('SELECT id, done FROM item_state').all();
    const states = Object.fromEntries(results.filter(row => allowed.has(row.id)).map(row => [row.id, Boolean(row.done)]));
    return json({ states });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not read shared state' }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB || !env.TRIP_ACCESS_CODE) return json({ error: 'D1 or access code is not configured' }, 503);
  if (request.headers.get('X-Trip-Code') !== env.TRIP_ACCESS_CODE) return json({ error: 'Incorrect access code' }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!payload || !allowed.has(payload.id) || typeof payload.done !== 'boolean') return json({ error: 'Invalid item or status' }, 400);
  try {
    await env.DB.prepare('INSERT INTO item_state (id, done, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at')
      .bind(payload.id, payload.done ? 1 : 0).run();
    return json({ id: payload.id, done: payload.done });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not save shared state' }, 500);
  }
}
