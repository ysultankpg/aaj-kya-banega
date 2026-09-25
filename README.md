# Aaj kya banega? 😉

A conversational recipe finder. Ask in plain words — *"how do I make Chicken Handi?"*,
*"what can I cook with paneer?"*, *"show me a Thai dish"* — and get the full recipe
with ingredients, measures, numbered steps and a video.

No backend, no API key, no accounts, no tracking. Recipe data comes from
[TheMealDB](https://www.themealdb.com).

## Run it locally

Open it over HTTP rather than double-clicking the file — browsers block
cross-origin requests from `file://`, so recipes will not load otherwise.

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Structure

| File | Role |
|---|---|
| `index.html` | Markup — header, chat log, composer |
| `styles.css` | Palette, theming, chat bubbles, background art |
| `recipe.css` | Recipe card and results grid |
| `food-outlines.svg` | Tiling line-art of veg, meat and fish |
| `api.js` | Intent parsing and TheMealDB calls |
| `render.js` | DOM building (via `textContent`, so no injection) |
| `app.js` | Controller — events, theme, request state |

## How a question is routed

`api.js` works out what is being asked before calling anything, because TheMealDB
has a separate endpoint per dimension:

| Question | Route |
|---|---|
| "how do I make Chicken Handi?" | name search |
| "what can I cook with paneer?" | ingredient filter |
| "show me a Thai dish" | cuisine filter |
| "give me a dessert recipe" | category filter |
| "surprise me" | random |

When a dish name has no match it retries the first word as an ingredient and says
so, rather than presenting unrelated results as the recipe that was asked for.

## Notes

Auto light/dark following the OS, with a manual toggle that persists.
Respects `prefers-reduced-motion`. Mobile-responsive.

Recipe content is © their respective authors via TheMealDB.
