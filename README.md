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
| `styles.css` | Palette, theming, chat bubbles |
| `backdrop.css` | Blurred blobs and the food line-art layer |
| `recipe.css` | Recipe card and results grid |
| `totop.css` | Back-to-top control |
| `food-outlines.svg` | Tiling line-art of veg, meat and fish |
| `intent.js` | Question → intent (cuisine, category, ingredient, name) |
| `api.js` | TheMealDB calls and result shaping |
| `render.js` | DOM building (via `textContent`, so no injection) |
| `app.js` | Controller — events, theme, request state |

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

TheMealDB is a curated collection of a few hundred dishes, not an exhaustive
index. Some cuisines are thin (15 Indian dishes) and some are empty
(Pakistani, Nepalese, Sri Lankan). The app says so plainly rather than
pretending the question was misunderstood.

## Notes

Auto light/dark following the OS, with a manual toggle that persists.
Respects `prefers-reduced-motion`. Mobile-responsive.

Recipe content is © their respective authors via TheMealDB.
