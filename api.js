/* ============================================================
   Aaj kya banega? — data layer
   Talks to TheMealDB (free, keyless) and normalises the results.
   Exposes a single global: window.RecipeAPI
   ============================================================ */
(function () {
  'use strict';

  var BASE = 'https://www.themealdb.com/api/json/v1/1/';

  /* Small fetch wrapper: returns parsed JSON, throws on HTTP error. */
  function get(path) {
    return fetch(BASE + path)
      .then(function (r) {
        if (!r.ok) throw new Error('Recipe service returned ' + r.status);
        return r.json();
      });
  }

  /* ---------------------------------------------------------
     Intent parsing.
     TheMealDB has separate endpoints for name / ingredient /
     cuisine / category, so we decide which one the question
     wants before calling anything.
     --------------------------------------------------------- */

  // Cuisines TheMealDB indexes (its "area" dimension).
  var AREAS = ['American','British','Canadian','Chinese','Croatian','Dutch',
    'Egyptian','Filipino','French','Greek','Indian','Irish','Italian','Jamaican',
    'Japanese','Kenyan','Malaysian','Mexican','Moroccan','Polish','Portuguese',
    'Russian','Spanish','Thai','Tunisian','Turkish','Ukrainian','Vietnamese'];

  // Loose words people actually type, mapped to the canonical area.
  var AREA_ALIASES = {
    thai:'Thai', indian:'Indian', desi:'Indian', italian:'Italian',
    chinese:'Chinese', japanese:'Japanese', mexican:'Mexican', greek:'Greek',
    french:'French', spanish:'Spanish', turkish:'Turkish', moroccan:'Moroccan',
    british:'British', american:'American', vietnamese:'Vietnamese',
    malaysian:'Malaysian', filipino:'Filipino', egyptian:'Egyptian',
    jamaican:'Jamaican', russian:'Russian', polish:'Polish', irish:'Irish',
    canadian:'Canadian', portuguese:'Portuguese', croatian:'Croatian',
    dutch:'Dutch', kenyan:'Kenyan', tunisian:'Tunisian', ukrainian:'Ukrainian'
  };

  // Category keywords → TheMealDB category.
  var CATEGORIES = {
    dessert:'Dessert', sweet:'Dessert', pudding:'Dessert', cake:'Dessert',
    vegetarian:'Vegetarian', veggie:'Vegetarian', vegan:'Vegan',
    seafood:'Seafood', fish:'Seafood', prawn:'Seafood',
    chicken:'Chicken', beef:'Beef', pork:'Pork', lamb:'Lamb',
    pasta:'Pasta', breakfast:'Breakfast', side:'Side', starter:'Starter',
    appetizer:'Starter', appetiser:'Starter', goat:'Goat', miscellaneous:'Miscellaneous'
  };

  // Filler words stripped before we treat the remainder as a dish name.
  var STOP = new RegExp(
    '\\b(how|do|i|you|to|can|could|would|please|make|cook|prepare|a|an|the|' +
    'recipe|recipes|for|of|me|give|show|find|get|want|need|some|any|dish|' +
    'dishes|food|meal|is|whats|what|s|there|tell|about|with|using|use|up|' +
    'got|have|ive|best|good|easy|quick|simple|step|steps|by|instructions)\\b',
    'gi');

  /* Reduce free text to comparable tokens. */
  function normalise(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  }

  /* Decide what the user is asking for. Returns {kind, value, label}. */
  function parseIntent(question) {
    var q = normalise(question);
    var words = q.split(/\s+/).filter(Boolean);

    // 1. Explicit randomness.
    if (/\b(surprise|random|anything|whatever|idea|inspire)\b/.test(q)) {
      return { kind: 'random', value: null, label: 'something to surprise you' };
    }

    // 2. Cuisine mention ("show me a Thai dish").
    for (var i = 0; i < words.length; i++) {
      var a = AREA_ALIASES[words[i]];
      if (a) return { kind: 'area', value: a, label: a + ' dishes' };
    }

    // 3. "I have X" / "what can I cook with X" → ingredient search.
    var byIngredient = /\b(?:with|using|from|out of|i have|ive got|have got)\b/.test(q);

    // 4. Category mention, but only when it is not the whole point of a
    //    dish name (e.g. "chicken biryani" should search by name).
    var catHit = null;
    for (var j = 0; j < words.length; j++) {
      if (CATEGORIES[words[j]]) { catHit = { word: words[j], cat: CATEGORIES[words[j]] }; break; }
    }

    // Strip filler to see what is actually left as a dish name.
    var core = q.replace(STOP, ' ').replace(/\s+/g, ' ').trim();

    if (byIngredient && core) {
      return { kind: 'ingredient', value: core.split(' ')[0], label: 'recipes using ' + core };
    }

    // A single leftover word that is a known category → browse the category.
    if (catHit && core.split(' ').length <= 1) {
      return { kind: 'category', value: catHit.cat, label: catHit.cat.toLowerCase() + ' recipes' };
    }

    if (core) return { kind: 'name', value: core, label: core };

    return { kind: 'random', value: null, label: 'something tasty' };
  }

  /* ---------------------------------------------------------
     Shaping TheMealDB's flat records into something usable.
     Its ingredients arrive as strIngredient1..20 / strMeasure1..20.
     --------------------------------------------------------- */
  function shape(meal) {
    var ingredients = [];
    for (var n = 1; n <= 20; n++) {
      var name = (meal['strIngredient' + n] || '').trim();
      if (!name) continue;
      ingredients.push({ name: name, qty: (meal['strMeasure' + n] || '').trim() });
    }

    // Split the single instructions blob into readable steps.
    var steps = String(meal.strInstructions || '')
      .split(/\r?\n+|(?<=\.)\s{2,}/)
      .map(function (s) { return s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim(); })
      .filter(function (s) { return s.length > 2; });

    // Nothing split cleanly? Fall back to sentence splitting.
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

  /* ---------------------------------------------------------
     Public entry point.
     Resolves to either {type:'recipe', recipe} (one exact hit)
     or {type:'choices', items} (a list to pick from).
     --------------------------------------------------------- */
  function ask(question) {
    var intent = parseIntent(question);

    if (intent.kind === 'random') {
      return get('random.php').then(function (d) {
        if (!d.meals) throw new Error('empty');
        return { type: 'recipe', recipe: shape(d.meals[0]), intent: intent };
      });
    }

    if (intent.kind === 'name') {
      return get('search.php?s=' + encodeURIComponent(intent.value))
        .then(function (d) {
          if (d.meals && d.meals.length === 1) {
            return { type: 'recipe', recipe: shape(d.meals[0]), intent: intent };
          }
          if (d.meals && d.meals.length > 1) {
            // Several dishes match the name — present them as a choice, and
            // relabel so the reply does not promise one specific recipe.
            return {
              type: 'choices',
              items: d.meals.slice(0, 8).map(brief),
              intent: { kind: 'matches', value: intent.value, label: intent.value }
            };
          }
          // No name match — retry the first word as an ingredient. Relabel to
          // 'fallback' so the UI says we widened the search instead of
          // claiming to have found the exact dish.
          var word = intent.value.split(' ')[0];
          return get('filter.php?i=' + encodeURIComponent(word))
            .then(function (f) {
              if (!f.meals) return { type: 'none', intent: intent };
              return {
                type: 'choices',
                items: f.meals.slice(0, 8).map(brief),
                intent: { kind: 'fallback', value: word, label: intent.value, used: word }
              };
            });
        });
    }

    // area / category / ingredient all use the filter endpoint.
    var key = intent.kind === 'area' ? 'a' : (intent.kind === 'category' ? 'c' : 'i');
    return get('filter.php?' + key + '=' + encodeURIComponent(intent.value))
      .then(function (d) {
        if (!d.meals) return { type: 'none', intent: intent };
        return { type: 'choices', items: d.meals.slice(0, 8).map(brief), intent: intent };
      });
  }

  /* Trim a filter result down to what a tile needs. */
  function brief(m) {
    return { id: m.idMeal, title: m.strMeal, image: m.strMealThumb };
  }

  /* Fetch one recipe by its id (used when a tile is clicked). */
  function byId(id) {
    return get('lookup.php?i=' + encodeURIComponent(id)).then(function (d) {
      if (!d.meals) throw new Error('not found');
      return shape(d.meals[0]);
    });
  }

  window.RecipeAPI = { ask: ask, byId: byId, parseIntent: parseIntent };
})();
