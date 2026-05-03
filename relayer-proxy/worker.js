// Cloudflare Worker that proxies BOTH the Octra bridge relayer and the Octra
// JSON-RPC node. Two reasons it exists:
//
//   1. CORS dedupe. The upstream relayer's nginx returns its CORS response
//      headers TWICE on POST responses (Access-Control-Allow-Origin appears
//      twice etc). Per Fetch spec browsers MUST reject responses with dup
//      CORS headers, so every POST from a static origin fails with
//      'TypeError: Failed to fetch'. curl ignores duplicates which is why
//      this is hard to spot from the CLI.
//
//   2. Geo-block bypass. Octra's RPC and/or relayer geo-restrict by source IP
//      in some regions. Routing through Cloudflare means the upstream sees a
//      Cloudflare egress IP (not the user's), so blocked users can still
//      reach the network. The end user only needs to reach *.workers.dev.
//
// Routing:
//   - GET  /recovery.json   → relayer (static unclaimed-msg index)
//   - POST /             → if JSON-RPC body's method starts with 'bridge*'
//                          → relayer; otherwise → octra RPC
//   - GET  /health       → tiny status endpoint, no upstream call (for sanity-
//                          checking that the worker itself is reachable)
//
// Free tier: 100k requests/day. Typical wallet usage is well under that.

const UPSTREAMS = {
  relayer: 'https://relayer-002838819188.octra.network',
  rpc:     'https://octra.network/rpc',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function pickUpstream(method) {
  // bridge* → relayer; everything else (octra_*, staging_view, contract_*) → rpc
  if (typeof method === 'string' && method.startsWith('bridge')) return 'relayer';
  return 'rpc';
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    // tiny health endpoint — useful for sanity-checking the worker is up
    if (request.method === 'GET' && incoming.pathname === '/health') {
      return jsonResponse({ ok: true, ts: Date.now(), upstreams: Object.keys(UPSTREAMS) });
    }

    // recovery.json is a static file served by the relayer
    if (request.method === 'GET' && incoming.pathname === '/recovery.json') {
      return forward(`${UPSTREAMS.relayer}/recovery.json${incoming.search}`, request, null);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: `unsupported method ${request.method} for path ${incoming.pathname}` }, 405);
    }

    // POST with JSON-RPC body — route by method
    const body = await request.text();
    let target = 'rpc';
    try {
      const parsed = JSON.parse(body);
      target = pickUpstream(parsed.method);
    } catch {
      // malformed body — let the upstream return its own error
    }

    return forward(UPSTREAMS[target] + incoming.search, request, body);
  },
};

async function forward(upstreamUrl, request, body) {
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' },
      body,
    });
  } catch (e) {
    return jsonResponse({ error: 'upstream unreachable', upstream: upstreamUrl, detail: String(e) }, 502);
  }

  // strip ALL upstream Access-Control-* headers (the relayer dups them) and
  // add a clean single set; preserve everything else verbatim.
  const headers = new Headers();
  for (const [k, v] of upstream.headers) {
    if (!k.toLowerCase().startsWith('access-control-')) headers.set(k, v);
  }
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

  return new Response(upstream.body, { status: upstream.status, headers });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
