/* ============================================================
   Aaj kya banega? — TheMealDB source
   Free, keyless, no proxy needed. Curated: a few hundred dishes
   with photos and, often, a video. Normalises into the shared
   recipe contract; ids are prefixed "mdb:" so api.js can route a
   later lookup back to the right index.
   Exposes: window.SourceMealDB
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
    return { id: 'mdb:' + m.idMeal, title: m.strMeal, image: m.strMealThumb };
  }

  function search(term) {
    return get('search.php?s=' + encodeURIComponent(term))
      .then(function (d) { return d.meals || []; });
  }

  function filter(key, value) {
    return get('filter.php?' + key + '=' + encodeURIComponent(value))
      .then(function (d) { return d.meals || []; });
  }

  function random() {
    return get('random.php').then(function (d) {
      if (!d.meals) throw new Error('empty');
      return shape(d.meals[0]);
    });
  }

  function byId(id) {
    var raw = String(id).replace(/^mdb:/, '');
    return get('lookup.php?i=' + encodeURIComponent(raw)).then(function (d) {
      if (!d.meals) throw new Error('not found');
      return shape(d.meals[0]);
    });
  }

  /* ---------------------------------------------------------
     Near-miss ladder.
     TheMealDB matches a plain substring of the TITLE, so a
     two-word query like "chicken biryani" finds nothing even
     though "Lamb Biryani" is in the collection. Try the head
     noun (usually the last word), then the other words longest
     first, then treat the first word as an ingredient.

     Returns { how: 'closest'|'fallback', used, meals } or null.
     Every hit here is a NEAR miss, so the caller must label it
     honestly — and prefers a real Spoonacular match over it.
     --------------------------------------------------------- */
  function candidates(phrase) {
    var words = phrase.split(' ').filter(function (w) { return w.length > 2; });
    if (words.length < 2) return [];
    var last = words[words.length - 1];
    var rest = words.slice(0, -1).sort(function (a, b) { return b.length - a.length; });
    return [last].concat(rest);
  }

  function climb(terms, i, phrase) {
    if (i >= terms.length) return widen(phrase);
    return search(terms[i]).then(function (meals) {
      if (!meals.length) return climb(terms, i + 1, phrase);
      return { how: 'closest', used: terms[i], meals: meals };
    });
  }

  function widen(phrase) {
    var word = phrase.split(' ')[0];
    return filter('i', word).then(function (meals) {
      if (!meals.length) return null;
      return { how: 'fallback', used: word, meals: meals };
    });
  }

  function nearest(phrase) {
    return climb(candidates(phrase), 0, phrase);
  }

  /* ---------------------------------------------------------
     Shaping the flat strIngredient1..20 record into the shared
     contract used by render.js.
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
      id: 'mdb:' + meal.idMeal,
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

  window.SourceMealDB = {
    search: search,
    filter: filter,
    random: random,
    byId: byId,
    nearest: nearest,
    brief: brief,
    shape: shape
  };
})();
