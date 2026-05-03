// Cloudflare Worker that proxies the Octra bridge relayer.
//
// Why this exists: the upstream relayer's nginx returns its CORS headers
// (Access-Control-Allow-Origin / Access-Control-Allow-Headers) TWICE on POST
// responses. browsers reject duplicated CORS headers per spec, so every POST
// from a static origin (octra.ac420.org) fails with 'Failed to fetch'. curl
// ignores duplicates which is why the bug is hard to spot from the CLI.
//
// This worker:
//  - forwards every request to the upstream relayer 1:1 (path + query + body)
//  - strips ALL upstream Access-Control-* headers
//  - adds clean, single-occurrence CORS headers on the response
//  - handles OPTIONS preflights without going upstream
//
// Free tier: 100k requests/day. A typical bridge claim makes ~10–50 requests.
// More than enough headroom unless your wallet goes properly viral.

const UPSTREAM = 'https://relayer-002838819188.octra.network';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);
    const upstreamUrl = `${UPSTREAM}${incoming.pathname}${incoming.search}`;

    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.arrayBuffer();
    }

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' },
        body,
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'upstream relayer unreachable', detail: String(e) }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // copy upstream headers EXCEPT any Access-Control-* (those are duplicated
    // upstream and would re-introduce the bug). add clean ones.
    const headers = new Headers();
    for (const [k, v] of upstream.headers) {
      if (!k.toLowerCase().startsWith('access-control-')) headers.set(k, v);
    }
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
