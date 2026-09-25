/* ============================================================
   Aaj kya banega? — Spoonacular proxy (Cloudflare Worker)

   Why this exists: GitHub Pages can only serve static files, so
   an API key placed in client JavaScript is public. This Worker
   holds the key as a secret and is the only thing that ever sees
   it — the browser talks to the Worker, the Worker talks to
   Spoonacular.

   It is deliberately NOT a generic proxy. Two fixed routes, a
   fixed upstream, validated parameters. If the Worker URL leaks,
   the worst anyone can do is search for recipes.

     GET /search?q=biryani&cuisine=Indian&type=breakfast&n=8
     GET /recipe?id=716429

   Deploy:
     npm install -g wrangler
     wrangler login
     wrangler secret put SPOONACULAR_KEY
     wrangler deploy
   ============================================================ */

const UPSTREAM = 'https://api.spoonacular.com/recipes';

/* Only these origins get a CORS grant. Add your own dev port here
   if you serve the site on something other than 8000/8777. */
const ORIGINS = [
  'https://ysultankpg.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8777',
  'http://127.0.0.1:8777'
];

/* Cache upstream answers for a day. The free tier is a daily point
   budget, so this is the difference between a working demo and a
   quota exhausted by lunchtime. Recipes do not change hourly. */
const TTL = 86400;

/* Spoonacular rejects unknown cuisines and dish types, so both are
   checked against its documented vocabulary before being passed on.
   Anything unrecognised is dropped rather than forwarded. */
const CUISINES = new Set(['African', 'Asian', 'American', 'British', 'Cajun',
  'Caribbean', 'Chinese', 'Eastern European', 'European', 'French', 'German',
  'Greek', 'Indian', 'Irish', 'Italian', 'Japanese', 'Jewish', 'Korean',
  'Latin American', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Nordic',
  'Southern', 'Spanish', 'Thai', 'Vietnamese']);

const TYPES = new Set(['main course', 'side dish', 'dessert', 'appetizer',
  'salad', 'bread', 'breakfast', 'soup', 'beverage', 'sauce', 'marinade',
  'fingerfood', 'snack', 'drink']);

function cors(origin) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=' + TTL,
    'Vary': 'Origin'
  };
  if (origin && ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function fail(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: Object.assign(cors(origin), { 'Cache-Control': 'no-store' })
  });
}

/* Build the upstream URL for a validated request. Returns null when
   the route or its parameters are not acceptable. */
function upstreamFor(url, key) {
  const p = url.searchParams;
  const n = Math.min(Math.max(parseInt(p.get('n'), 10) || 8, 1), 12);

  if (url.pathname === '/search') {
    const q = (p.get('q') || '').trim().slice(0, 80);
    const type = (p.get('type') || '').trim().toLowerCase();
    /* Validate BEFORE the emptiness check. An unrecognised cuisine is
       dropped, and if that leaves nothing to search on, the request has
       to be rejected — otherwise it degrades into an unfiltered random
       query that spends a quota point to answer a question nobody asked. */
    const cuisine = CUISINES.has((p.get('cuisine') || '').trim())
      ? (p.get('cuisine') || '').trim() : '';
    if (!q && !cuisine) return null;

    const u = new URL(UPSTREAM + '/complexSearch');
    if (q) u.searchParams.set('query', q);
    if (cuisine) u.searchParams.set('cuisine', cuisine);
    if (TYPES.has(type)) u.searchParams.set('type', type);
    u.searchParams.set('number', String(n));
    u.searchParams.set('sort', q ? 'popularity' : 'random');
    u.searchParams.set('apiKey', key);
    return u;
  }

  if (url.pathname === '/recipe') {
    /* Digits only — this segment goes into a path, so it must not be
       able to carry a slash and reach a different endpoint. */
    const id = (p.get('id') || '').replace(/\D/g, '').slice(0, 12);
    if (!id) return null;

    const u = new URL(UPSTREAM + '/' + id + '/information');
    u.searchParams.set('includeNutrition', 'false');
    u.searchParams.set('apiKey', key);
    return u;
  }

  return null;
}

/* Exported only so the validation logic can be unit-tested without a
   deployed Worker. Cloudflare ignores named exports besides `default`. */
export { upstreamFor };

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: Object.assign(cors(origin), {
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400'
        })
      });
    }
    if (request.method !== 'GET') return fail(405, 'Only GET is supported.', origin);
    if (!env.SPOONACULAR_KEY) {
      return fail(503, 'Proxy is not configured with an API key.', origin);
    }

    /* /health reports the key's length and shape only — never the key.
       Enough to diagnose a paste error (wrong length, stray whitespace)
       without exposing the secret. Checked BEFORE route validation,
       since it is not a Spoonacular passthrough. */
    if (url.pathname === '/health') {
      const k = env.SPOONACULAR_KEY;
      return new Response(JSON.stringify({
        ok: true,
        keyLength: k.length,
        looksLikeSpoonacularKey: /^[a-f0-9]{32}$/i.test(k),
        hasWhitespace: /\s/.test(k)
      }), { headers: Object.assign(cors(origin), { 'Cache-Control': 'no-store' }) });
    }

    const upstream = upstreamFor(url, env.SPOONACULAR_KEY);
    if (!upstream) return fail(400, 'Unsupported route or parameters.', origin);

    /* Cache key is the CLIENT url, never the upstream one — the
       upstream carries the secret and must not be stored. */
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const fresh = new Response(hit.body, hit);
      const allow = cors(origin)['Access-Control-Allow-Origin'];
      if (allow) fresh.headers.set('Access-Control-Allow-Origin', allow);
      fresh.headers.set('X-Proxy-Cache', 'hit');
      return fresh;
    }

    let res;
    try {
      res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
    } catch (e) {
      return fail(502, 'Recipe index unreachable.', origin);
    }

    /* 402 is Spoonacular's daily-quota signal. Surface it as itself so
       the client can fall back quietly instead of showing an error. */
    if (res.status === 402) return fail(402, 'Daily recipe quota reached.', origin);
    /* 401/403 means the key is missing, wrong or revoked — a deployment
       problem, not a user one. Say so explicitly: collapsing it into a
       generic 502 makes a one-line fix look like an outage. */
    if (res.status === 401 || res.status === 403) {
      return fail(500, 'Spoonacular rejected the API key (HTTP ' + res.status +
        '). Re-run: wrangler secret put SPOONACULAR_KEY', origin);
    }
    if (!res.ok) return fail(502, 'Recipe index returned ' + res.status + '.', origin);

    const body = await res.text();
    const out = new Response(body, { status: 200, headers: cors(origin) });
    ctx.waitUntil(cache.put(cacheKey, new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + TTL }
    })));
    return out;
  }
};
