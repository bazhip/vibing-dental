const upstream = 'https://dailymed.nlm.nih.gov/dailymed/services/v2/';
const veterinaryTypes = ['50578-4', '50577-6'];
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const maxLabelBytes = 2 * 1024 * 1024;

async function readLabel(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty label response');
  const decoder = new TextDecoder();
  let size = 0;
  let xml = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return xml + decoder.decode();
      size += value.byteLength;
      if (size > maxLabelBytes) throw new Error('Label size limit');
      xml += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export default async function drugReference(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Origin');
  const origin = request.headers.origin;
  if (origin === 'capacitor://localhost' || origin === 'https://localhost') {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  const reply = (status, body, contentType = 'application/json; charset=utf-8') => {
    response.statusCode = status;
    response.setHeader('Content-Type', contentType);
    response.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return reply(405, { error: 'method' });
  }
  const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
  const query = params.get('q')?.trim();
  const id = params.get('label');
  const validQuery = !!query && query.length <= 100
    && /^[\p{L}\p{N}][\p{L}\p{N} .()+,'’/\-]*$/u.test(query);
  if ((id === null && !validQuery) || (id !== null && (params.has('q') || !uuid.test(id)))) {
    return reply(400, { error: 'invalid_request' });
  }
  try {
    const options = { redirect: 'error', signal: AbortSignal.timeout(8000) };
    if (id) {
      const result = await fetch(new URL(`spls/${id}.xml`, upstream), options);
      if (!result.ok) return reply(result.status === 404 ? 404 : 502, { error: 'unavailable' });
      return reply(200, await readLabel(result), 'text/plain; charset=utf-8');
    }
    const pages = await Promise.all(veterinaryTypes.map(async doctype => {
      const url = new URL('spls.json', upstream);
      url.search = new URLSearchParams({ drug_name: query, doctype, pagesize: '10' }).toString();
      const result = await fetch(url, options);
      if (result.status === 404) return [];
      if (!result.ok) throw new Error('Search upstream failed');
      const { data } = await result.json();
      if (!Array.isArray(data)) throw new Error('Invalid search response');
      return data.flatMap(row => typeof row?.title === 'string' && uuid.test(row.setid)
        ? [{ id: row.setid, title: row.title }] : []);
    }));
    const products = Array.from(new Map(pages.flat().map(product => [product.id, product])).values());
    return reply(200, { products });
  } catch {
    return reply(502, { error: 'unavailable' });
  }
}
