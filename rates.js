const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' }
});

function extractCell(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').trim();
}

function parseBoc(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const found = {};
  for (const [, row] of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => extractCell(match[1]));
    const currency = cells[0]?.replace(/\s/g, '');
    if (currency !== '欧元' && currency !== '瑞士法郎') continue;
    const sell = Number(cells[3]); // 中行牌价表：现汇卖出价，每 100 单位外币的人民币价
    const timestamp = cells[6]?.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/)?.[0];
    if (Number.isFinite(sell) && sell > 0 && timestamp) found[currency] = { rate: sell / 100, timestamp };
  }
  if (!found['欧元'] || !found['瑞士法郎']) throw Error('BOC rate table changed or incomplete');
  return found;
}

function parseEcbCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(line => {
    const cells = []; let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += ch;
    }
    cells.push(cell);
    return cells;
  });
  const headers = rows.shift() || [];
  const at = name => headers.indexOf(name);
  if (['TIME_PERIOD', 'CURRENCY', 'OBS_VALUE'].some(name => at(name) < 0)) throw Error('Unexpected ECB data format');
  return rows.map(row => ({ date: row[at('TIME_PERIOD')], currency: row[at('CURRENCY')], value: Number(row[at('OBS_VALUE')]) }));
}

async function ecbFallback(requestedDate, reason) {
  const today = new Date().toISOString().slice(0, 10);
  const end = requestedDate < today ? requestedDate : today;
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10);
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.CNY+CHF.EUR.SP00.A?startPeriod=${start}&endPeriod=${end}&format=csvdata&detail=dataonly`;
  const response = await fetch(url, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw Error(`ECB HTTP ${response.status}`);
  const dates = new Map();
  for (const row of parseEcbCsv(await response.text())) {
    if (row.date > end || !Number.isFinite(row.value) || row.value <= 0) continue;
    if (!dates.has(row.date)) dates.set(row.date, {});
    dates.get(row.date)[row.currency] = row.value;
  }
  const date = [...dates.keys()].sort().reverse().find(day => dates.get(day).CNY && dates.get(day).CHF);
  if (!date) throw Error('No published rate for this period');
  return { requestedDate, rateDate: date, source: 'ECB', fallbackReason: reason, cnyPerEur: dates.get(date).CNY, cnyPerChf: dates.get(date).CNY / dates.get(date).CHF };
}

export async function onRequestGet({ request }) {
  const requestedDate = new URL(request.url).searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') || Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`))) return json({ error: 'Invalid date' }, 400);
  // 中行公开页提供当前现汇卖出价。即使补记旧账也优先给出银行购买外币的当前估算价，
  // 并返回真实牌价日期，让前端明确提示它与消费日期不同；实际扣款仍可覆盖估算。
  try {
    const response = await fetch('https://www.boc.cn/sourcedb/whpj/', { headers: { Accept: 'text/html' } });
    if (!response.ok) throw Error(`BOC HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const charset = /charset\s*=\s*([\w-]+)/i.exec(response.headers.get('content-type') || '')?.[1] || 'gbk';
    let html = new TextDecoder(charset).decode(bytes);
    if (!html.includes('瑞士法郎')) html = new TextDecoder('utf-8').decode(bytes);
    const rates = parseBoc(html);
    return json({ requestedDate, rateDate: rates['欧元'].timestamp.slice(0, 10).replaceAll('/', '-'), rateTime: rates['欧元'].timestamp, source: 'BOC', cnyPerEur: rates['欧元'].rate, cnyPerChf: rates['瑞士法郎'].rate });
  } catch (error) {
    console.error('Could not read BOC rates', error);
    try { return json(await ecbFallback(requestedDate, '中行牌价暂时不可用')); }
    catch (fallbackError) { console.error('Could not read fallback rates', fallbackError); return json({ error: 'Rate service unavailable' }, 503); }
  }
}
