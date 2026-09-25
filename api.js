/* ============================================================
   Aaj kya banega? — orchestrator
   Picks a route from the parsed intent, then decides which index
   answers it. TheMealDB goes first: it is free, unlimited, and
   its recipes have photos and videos. Spoonacular is asked only
   when TheMealDB has nothing real to offer — which keeps the
   daily quota for the questions that actually need it.

   Result shapes handed to app.js:
     { type:'recipe',  recipe, intent }
     { type:'choices', items,  intent }
     { type:'none',    intent }
   Exposes: window.RecipeAPI = { ask, byId, parseIntent }
   ============================================================ */
(function () {
  'use strict';

  var MDB = window.SourceMealDB;
  var SPN = window.SourceSpoon;

  function pick(items, intent) {
    return { type: 'choices', items: items.slice(0, 8), intent: intent };
  }

  /* --- Dish by name ----------------------------------------
     Order matters. A genuine Spoonacular match beats TheMealDB's
     near miss, but an exact TheMealDB hit beats both — it comes
     with a video. */
  function byName(intent) {
    return MDB.search(intent.value).then(function (meals) {
      if (meals.length === 1) {
        return { type: 'recipe', recipe: MDB.shape(meals[0]), intent: intent };
      }
      if (meals.length > 1) {
        return pick(meals.map(MDB.brief), { kind: 'matches', label: intent.value });
      }
      return SPN.search({ q: intent.value }).then(function (hits) {
        if (hits.length === 1) {
          return SPN.byId(hits[0].id).then(function (r) {
            return { type: 'recipe', recipe: r,
                     intent: { kind: 'wider', label: intent.value } };
          });
        }
        if (hits.length) {
          return pick(hits, { kind: 'wider', label: intent.value });
        }
        return nearMiss(intent);
      });
    });
  }

  /* Nothing exact in either index. Spoonacular's search ANDs the
     query words against the title, so "chicken biryani" scores 0
     while "biryani" finds four — the same head-noun trick that
     TheMealDB needs. Verified against the live API.

     Tried in this order because the cost differs: TheMealDB's
     ladder is free and unmetered, so it goes first, and the wider
     index is only asked when that comes back empty. Both are near
     misses, so both get labelled as such. */
  function nearMiss(intent) {
    return MDB.nearest(intent.value).then(function (near) {
      if (near) {
        if (near.how === 'closest' && near.meals.length === 1) {
          return { type: 'recipe', recipe: MDB.shape(near.meals[0]),
                   intent: { kind: 'closest', label: intent.value, used: near.used } };
        }
        return pick(near.meals.map(MDB.brief),
                    { kind: near.how, label: intent.value, used: near.used });
      }
      return wideNearMiss(intent);
    });
  }

  /* Head noun only — the last word of the phrase, which for dish
     names is almost always the dish ("...  biryani", "... masala"). */
  function wideNearMiss(intent) {
    var words = intent.value.split(' ').filter(function (w) { return w.length > 2; });
    if (words.length < 2) return { type: 'none', intent: intent };
    var head = words[words.length - 1];
    return SPN.search({ q: head }).then(function (hits) {
      if (!hits.length) return { type: 'none', intent: intent };
      return pick(hits, { kind: 'closest', label: intent.value, used: head });
    });
  }

  /* --- Cuisine ---------------------------------------------
     Spoonacular filters by a fixed list of 27 cuisines. When the
     one asked for is on it, use the filter — it is precise. When
     it is not (Pakistani, Nepalese, Sri Lankan, all absent from
     both indexes' filters) fall back to searching the word as
     text, which does surface those dishes by title. */
  function wideArea(intent) {
    if (SPN.knownCuisine(intent.adj)) {
      return SPN.search({ cuisine: intent.adj, cat: intent.cat })
        .then(function (hits) {
          return hits.length
            ? pick(hits, { kind: 'widerarea', adj: intent.adj, label: intent.label })
            : null;
        });
    }
    /* Search the demonym alone, never intent.label — the label reads
       "Pakistani dishes", and since the query ANDs its words that
       would demand both in one title. A two-word demonym has the
       same problem ("Sri Lankan"), so fall back to its last word,
       which is the distinctive half. */
    var words = String(intent.adj || '').split(' ');
    return SPN.search({ q: intent.adj, cat: intent.cat })
      .then(function (hits) {
        if (hits.length || words.length < 2) return hits;
        return SPN.search({ q: words[words.length - 1], cat: intent.cat });
      })
      .then(function (hits) {
        return hits.length
          ? pick(hits, { kind: 'widerarea', adj: intent.adj, label: intent.label })
          : null;
      });
  }

  function byArea(intent) {
    return MDB.filter('a', intent.value).then(function (meals) {
      if (meals.length) return pick(meals.map(MDB.brief), intent);
      return wideArea(intent).then(function (res) {
        return res || { type: 'none', intent: intent };
      });
    });
  }

  /* --- Cuisine + category, e.g. "indian breakfast" ---------
     TheMealDB filters one dimension per call, so intersect two
     locally. Spoonacular can do both at once, so it gets the
     question whenever the intersection is empty — a far better
     answer than offering the cuisine with the category dropped. */
  function byAreaCat(intent) {
    return Promise.all([MDB.filter('a', intent.value), MDB.filter('c', intent.cat)])
      .then(function (r) {
        var ids = {};
        r[1].forEach(function (m) { ids[m.idMeal] = true; });
        var both = r[0].filter(function (m) { return ids[m.idMeal]; });
        if (both.length) return pick(both.map(MDB.brief), intent);

        return wideArea(intent).then(function (res) {
          if (res) return res;
          // Still nothing — the cuisine alone, honestly labelled.
          if (r[0].length) {
            return pick(r[0].map(MDB.brief),
                        { kind: 'nooverlap', adj: intent.adj, cat: intent.cat,
                          label: intent.label });
          }
          return { type: 'none', intent: intent };
        });
      });
  }

  /* --- Category or ingredient ------------------------------ */
  function byFilter(intent) {
    var key = intent.kind === 'category' ? 'c' : 'i';
    return MDB.filter(key, intent.value).then(function (meals) {
      if (meals.length) return pick(meals.map(MDB.brief), intent);
      // An unknown ingredient is the common case here; the wider
      // index knows a great many more of them.
      return SPN.search({ q: intent.value }).then(function (hits) {
        if (!hits.length) return { type: 'none', intent: intent };
        return pick(hits, { kind: 'wider', label: intent.value });
      });
    });
  }

  /* --- Public entry points --------------------------------- */
  function ask(question) {
    var intent = window.RecipeIntent.parse(question);

    if (intent.kind === 'random') {
      return MDB.random().then(function (r) {
        return { type: 'recipe', recipe: r, intent: intent };
      });
    }
    if (intent.kind === 'name') return byName(intent);
    if (intent.kind === 'areacat') return byAreaCat(intent);
    if (intent.kind === 'area') return byArea(intent);
    return byFilter(intent);
  }

  /* Ids carry their origin as a prefix, set by whichever source
     produced them, so a tap on a tile always goes back to the
     index that knows the recipe. */
  function byId(id) {
    return String(id).indexOf('spn:') === 0
      ? SPN.byId(String(id).slice(4))
      : MDB.byId(id);
  }

  window.RecipeAPI = { ask: ask, byId: byId, parseIntent: window.RecipeIntent.parse };
})();
