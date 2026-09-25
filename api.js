/* ============================================================
   Aaj kya banega? — data layer
   Talks to TheMealDB (free, keyless) and normalises the results.
   Intent parsing lives in intent.js.
   Exposes: window.RecipeAPI = { ask, byId, parseIntent }
   ============================================================ */
(function () {
  'use strict';

  var BASE = 'https://www.themealdb.com/api/json/v1/1/';

  function get(path) {
    return fetch(BASE + path).then(function (r) {
      if (!r.ok) throw new Error('Recipe service returned ' + r.status);
      return r.json();
    });
  }

  function brief(m) {
    return { id: m.idMeal, title: m.strMeal, image: m.strMealThumb };
  }

  function search(term) {
    return get('search.php?s=' + encodeURIComponent(term))
      .then(function (d) { return d.meals || []; });
  }

  function filter(key, value) {
    return get('filter.php?' + key + '=' + encodeURIComponent(value))
      .then(function (d) { return d.meals || []; });
  }

  /* ---------------------------------------------------------
     Name search ladder.
     TheMealDB matches a plain substring of the TITLE, so a
     two-word query like "chicken biryani" finds nothing even
     though "Lamb Biryani" is in the collection. Retry with the
     head noun (usually the last word) before giving up and
     widening to an ingredient search.
     --------------------------------------------------------- */
  function candidates(phrase) {
    var words = phrase.split(' ').filter(function (w) { return w.length > 2; });
    if (words.length < 2) return [];
    var last = words[words.length - 1];
    var rest = words.slice(0, -1).sort(function (a, b) { return b.length - a.length; });
    return [last].concat(rest);
  }

  function byName(intent) {
    return search(intent.value).then(function (meals) {
      if (meals.length === 1) {
        return { type: 'recipe', recipe: shape(meals[0]), intent: intent };
      }
      if (meals.length > 1) {
        return { type: 'choices', items: meals.slice(0, 8).map(brief),
                 intent: { kind: 'matches', label: intent.value } };
      }
      return climb(candidates(intent.value), 0, intent);
    });
  }

  /* Walk the candidate terms one at a time; first hit wins. */
  function climb(terms, i, intent) {
    if (i >= terms.length) return widen(intent);
    return search(terms[i]).then(function (meals) {
      if (!meals.length) return climb(terms, i + 1, intent);
      if (meals.length === 1) {
        return { type: 'recipe', recipe: shape(meals[0]),
                 intent: { kind: 'closest', label: intent.value, used: terms[i] } };
      }
      return { type: 'choices', items: meals.slice(0, 8).map(brief),
               intent: { kind: 'closest', label: intent.value, used: terms[i] } };
    });
  }

  /* Last resort: treat the first word as an ingredient. */
  function widen(intent) {
    var word = intent.value.split(' ')[0];
    return filter('i', word).then(function (meals) {
      if (!meals.length) return { type: 'none', intent: intent };
      return { type: 'choices', items: meals.slice(0, 8).map(brief),
               intent: { kind: 'fallback', label: intent.value, used: word } };
    });
  }

  /* Cuisine + category, e.g. "indian breakfast". filter.php takes only
     one dimension at a time, so intersect two calls locally. */
  function byAreaCat(intent) {
    return Promise.all([filter('a', intent.value), filter('c', intent.cat)])
      .then(function (r) {
        var ids = {};
        r[1].forEach(function (m) { ids[m.idMeal] = true; });
        var both = r[0].filter(function (m) { return ids[m.idMeal]; });
        if (both.length) {
          return { type: 'choices', items: both.slice(0, 8).map(brief), intent: intent };
        }
        // No overlap — offer the cuisine on its own rather than nothing.
        if (r[0].length) {
          return { type: 'choices', items: r[0].slice(0, 8).map(brief),
                   intent: { kind: 'nooverlap', adj: intent.adj, cat: intent.cat,
                             label: intent.label } };
        }
        return { type: 'none', intent: intent };
      });
  }

  /* ---------------------------------------------------------
     Shaping TheMealDB's flat records into something usable.
     --------------------------------------------------------- */
  function shape(meal) {
    var ingredients = [];
    for (var n = 1; n <= 20; n++) {
      var name = (meal['strIngredient' + n] || '').trim();
      if (!name) continue;
      ingredients.push({ name: name, qty: (meal['strMeasure' + n] || '').trim() });
    }

    var steps = String(meal.strInstructions || '')
      .split(/\r?\n+|(?<=\.)\s{2,}/)
      .map(function (s) { return s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim(); })
      .filter(function (s) { return s.length > 2; });

    if (steps.length < 2) {
      steps = String(meal.strInstructions || '')
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 2; });
    }

    return {
      id: meal.idMeal,
      title: meal.strMeal,
      image: meal.strMealThumb,
      area: meal.strArea || '',
      category: meal.strCategory || '',
      tags: (meal.strTags || '').split(',').filter(Boolean),
      video: meal.strYoutube || '',
      source: meal.strSource || '',
      ingredients: ingredients,
      steps: steps
    };
  }

  /* --- Public entry point ----------------------------------- */
  function ask(question) {
    var intent = window.RecipeIntent.parse(question);

    if (intent.kind === 'random') {
      return get('random.php').then(function (d) {
        if (!d.meals) throw new Error('empty');
        return { type: 'recipe', recipe: shape(d.meals[0]), intent: intent };
      });
    }

    if (intent.kind === 'name') return byName(intent);
    if (intent.kind === 'areacat') return byAreaCat(intent);

    var key = intent.kind === 'area' ? 'a' : (intent.kind === 'category' ? 'c' : 'i');
    return filter(key, intent.value).then(function (meals) {
      if (!meals.length) return { type: 'none', intent: intent };
      return { type: 'choices', items: meals.slice(0, 8).map(brief), intent: intent };
    });
  }

  function byId(id) {
    return get('lookup.php?i=' + encodeURIComponent(id)).then(function (d) {
      if (!d.meals) throw new Error('not found');
      return shape(d.meals[0]);
    });
  }

  window.RecipeAPI = { ask: ask, byId: byId, parseIntent: window.RecipeIntent.parse };
})();
