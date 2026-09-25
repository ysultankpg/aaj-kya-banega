# Aaj kya banega? 😉

A conversational recipe finder. Ask in plain words — *"how do I make Chicken Handi?"*,
*"what can I cook with paneer?"*, *"show me a Thai dish"* — and get the full recipe
with ingredients, measures, numbered steps and a video.

No backend to run, no accounts, no tracking. Recipes come from two indexes:
[TheMealDB](https://www.themealdb.com) (free, keyless) and, for anything
TheMealDB has not heard of, [Spoonacular](https://spoonacular.com/food-api)
through a small Cloudflare Worker that holds the API key. The site itself stays
a pile of static files and works fine with the Worker switched off.

## Run it locally

Open it over HTTP rather than double-clicking the file — browsers block
cross-origin requests from `file://`, so recipes will not load otherwise.

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

To turn on the wider index, deploy the Worker and put its URL in `config.js` —
see [worker/README.md](worker/README.md). Skip it and everything still works,
just with narrower coverage.

## Structure

| File | Role |
|---|---|
| `index.html` | Markup — header, chat log, composer |
| `config.js` | The one setting: the Worker URL (blank = TheMealDB only) |
| `styles.css` | Palette, theming, chat bubbles |
| `backdrop.css` | Blurred blobs and the food line-art layer |
| `recipe.css` | Recipe card and results grid |
| `totop.css` | Back-to-top control |
| `food-outlines.svg` | Tiling line-art of veg, meat and fish |
| `intent.js` | Question → intent (cuisine, category, ingredient, name) |
| `mealdb.js` | TheMealDB source |
| `spoon.js` | Spoonacular source, via the Worker |
| `api.js` | Orchestrator — routes the intent, picks the index |
| `render.js` | DOM building (via `textContent`, so no injection) |
| `app.js` | Controller — events, theme, request state |
| `worker/` | Cloudflare Worker that fronts Spoonacular |

Both sources normalise into one recipe shape — `{ id, title, image, area,
category, tags, video, source, ingredients:[{name,qty}], steps:[] }` — so
`render.js` never knows which index an answer came from. Ids carry their origin
as a prefix (`mdb:52805`, `spn:716429`), which is how tapping a result gets
routed back to the right index.

## How a question is routed

`intent.js` works out what is being asked before anything is fetched, because
TheMealDB has a separate endpoint per dimension:

| Question | Route |
|---|---|
| "how do I make Chicken Handi?" | name search |
| "what can I cook with paneer?" | ingredient filter |
| "show me a Thai dish" | cuisine filter |
| "give me a dessert recipe" | category filter |
| "suggest an indian breakfast" | cuisine ∩ category, intersected locally |
| "surprise me" | random |

### Two API quirks worth knowing

**`list.php?a=list` and `filter.php?a=` disagree.** The list returns demonyms
(`Indian`, `French`, `American`, `Dutch`, `Bangladeshi`) but the filter only
matches country names for those five — passing the demonym returns nothing at
all. Every cuisine alias in `intent.js` therefore resolves to the *country*
name, keeping the adjective only for wording replies.

**Name search is a plain substring match on the title.** `chicken biryani`
finds nothing even though `Lamb Biryani` exists. `api.js` retries with the head
noun (usually the last word) before widening to an ingredient search, and
labels the reply honestly at each step — a near miss is never presented as the
dish that was asked for.

## Coverage

TheMealDB is a curated collection of a few hundred dishes. Good recipes, with
photos and often a video, but not an index — 15 Indian dishes, and nothing at
all under Pakistani, Nepalese or Sri Lankan. Spoonacular covers hundreds of
thousands, so it fills the gaps.

TheMealDB is always asked first: it is free and unmetered, and its recipes are
richer. Spoonacular is only reached when TheMealDB has nothing genuine to
offer — and a real Spoonacular match now outranks a TheMealDB near miss, which
is why *chicken biryani* returns chicken biryani rather than Lamb Biryani.

Where the answer came from is always stated. Replies from the wider index say
so, and near misses stay labelled as near misses.

The free Spoonacular tier is 150 points a day. Three things keep it from
running out: TheMealDB absorbs most traffic, the Worker caches every answer at
the edge for 24 hours, and a quota response stops the client asking again for
the rest of the session — it drops back to TheMealDB instead of erroring.

## Notes

Auto light/dark following the OS, with a manual toggle that persists.
Respects `prefers-reduced-motion`. Mobile-responsive.

Recipe content is © their respective authors via TheMealDB and Spoonacular.
