# Spoonacular proxy

TheMealDB is curated — a few hundred dishes. Good ones, but ask for
chicken biryani and it is not there. Spoonacular indexes hundreds of
thousands of recipes, and needs an API key.

A key cannot live in client JavaScript on GitHub Pages; anyone can read
it and burn the quota. This Worker holds it instead.

## Deploy

1. Get a free key at <https://spoonacular.com/food-api/console#Dashboard>
   (150 points/day, roughly 50–100 searches).

2. Install and log in:

   ```sh
   npm install -g wrangler
   wrangler login
   ```

3. From this directory, store the key and deploy:

   ```sh
   cd worker
   wrangler secret put SPOONACULAR_KEY   # paste the key when prompted
   wrangler deploy
   ```

   `wrangler deploy` prints a URL like
   `https://aaj-kya-banega-api.<your-subdomain>.workers.dev`.

4. Put that URL in `../config.js`:

   ```js
   window.RecipeConfig = { proxy: 'https://aaj-kya-banega-api.xxx.workers.dev' };
   ```

Leave `proxy` empty and the app runs on TheMealDB alone — no errors,
just narrower coverage.

## What it does and does not allow

Two routes only, with a fixed upstream:

| Route | Upstream |
|---|---|
| `GET /search?q=&cuisine=&type=&n=` | `complexSearch` |
| `GET /recipe?id=` | `{id}/information` |

Everything else is a 400. `cuisine` and `type` are checked against
Spoonacular's documented vocabulary, `id` is stripped to digits, `n` is
clamped to 12. It is not a general-purpose proxy, so a leaked Worker URL
buys an attacker nothing but recipe searches.

CORS is granted only to the origins listed in `ORIGINS` in
`src/worker.js`. Edit that list if you host the page elsewhere.

## Quota

Responses are cached at the edge for 24 hours, keyed on the client URL —
repeat questions cost nothing. The client only reaches for Spoonacular
when TheMealDB has no answer, which keeps most traffic free.

When the daily budget runs out Spoonacular returns 402; the Worker
passes that through and the client falls back to TheMealDB's near
matches rather than showing a failure.
