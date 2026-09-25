/* ============================================================
   Aaj kya banega? — Spoonacular source
   Second recipe index, reached through the Cloudflare Worker in
   worker/ so the API key stays server-side. Normalises every
   response into the same shape TheMealDB produces, so render.js
   does not know or care which index a recipe came from.
   Exposes: window.SourceSpoon
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.RecipeConfig || {};
  var PROXY = String(cfg.proxy || '').replace(/\/+$/, '');

  /* Latched off for the rest of the session once the wider index is
     known to be unusable — quota gone (402) or the proxy misconfigured
     (5xx). Either way every further call would pay a round trip to
     learn the same thing, so fall back to TheMealDB and stay there. */
  var off = false;

  function enabled() { return !!PROXY && !off; }

  function get(path) {
    return fetch(PROXY + path).then(function (r) {
      if (r.status === 402) { off = true; throw new Error('quota reached'); }
      if (r.status >= 500) {
        off = true;
        /* Surface the Worker's own message — it distinguishes a bad API
           key from a genuine outage, which matters when setting up. */
        return r.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'proxy error ' + r.status);
        });
      }
      if (!r.ok) throw new Error('spoon ' + r.status);
      return r.json();
    });
  }

  /* TheMealDB categories vs Spoonacular dish types. Only the ones
     that genuinely correspond are mapped; a category with no
     equivalent is simply dropped from the query rather than
     forced onto the nearest-looking type. */
  var TYPES = {
    Breakfast: 'breakfast', Dessert: 'dessert', Starter: 'appetizer',
    Side: 'side dish', Miscellaneous: '', Pasta: 'main course',
    Beef: 'main course', Chicken: 'main course', Lamb: 'main course',
    Pork: 'main course', Seafood: 'main course', Goat: 'main course'
  };

  function brief(r) {
    return { id: 'spn:' + r.id, title: r.title, image: r.image || '' };
  }

  /* --- Search ------------------------------------------------ */
  /* opts: { q, cuisine (demonym, e.g. "Indian"), cat (TheMealDB
     category), n }. Returns [] on any failure — Spoonacular is a
     bonus source, never a reason for the app to break. */
  function search(opts) {
    if (!enabled()) return Promise.resolve([]);
    var p = [];
    if (opts.q) p.push('q=' + encodeURIComponent(opts.q));
    if (opts.cuisine) p.push('cuisine=' + encodeURIComponent(opts.cuisine));
    if (opts.cat && TYPES[opts.cat]) p.push('type=' + encodeURIComponent(TYPES[opts.cat]));
    p.push('n=' + (opts.n || 8));

    return get('/search?' + p.join('&'))
      .then(function (d) { return (d.results || []).map(brief); })
      .catch(function (e) {
        /* Never propagate: the wider index is a bonus, never a reason
           for the app to fail. Logged once so a misconfigured key is
           findable in the console instead of silently invisible. */
        if (window.console) console.warn('Wider recipe index unavailable:', e.message);
        return [];
      });
  }

  /* --- One recipe by id -------------------------------------
     Accepts either "spn:716429" or a bare id. */
  function byId(id) {
    if (!PROXY) return Promise.reject(new Error('no proxy configured'));
    var raw = String(id).replace(/^spn:/, '');
    return get('/recipe?id=' + encodeURIComponent(raw)).then(shape);
  }

  /* ---------------------------------------------------------
     Normalising. Target contract, shared with TheMealDB:
     { id, title, image, area, category, tags, video, source,
       ingredients:[{name,qty}], steps:[String] }
     --------------------------------------------------------- */

  /* Spoonacular's `instructions` field is HTML. It is only ever
     rendered through textContent, so this is about readability,
     not safety: strip tags, decode the handful of entities that
     actually show up, collapse whitespace. */
  function detag(html) {
    return String(html || '')
      .replace(/<li[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|ol|ul|br)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ');
  }

  function stepsFrom(r) {
    /* analyzedInstructions is already split into numbered steps —
       far better than guessing sentence boundaries. It can hold
       several blocks (a dish with a sauce), so flatten them all. */
    var out = [];
    (r.analyzedInstructions || []).forEach(function (block) {
      (block.steps || []).forEach(function (s) {
        var t = detag(s.step).trim();
        if (t.length > 2) out.push(t);
      });
    });
    if (out.length) return out;

    return detag(r.instructions).split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
      .map(function (s) {
        return s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim();
      })
      .filter(function (s) { return s.length > 2; });
  }

  /* Spoonacular returns raw floats — 0.3333333333 for a third of a
     cup, 473.176 for two cups in ml. Neither is how a recipe reads,
     so snap to the fractions cooks actually use and drop the decimal
     on anything large enough not to need it. */
  var FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'],
    [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞']];

  function pretty(amount) {
    if (amount >= 10) return String(Math.round(amount));
    var whole = Math.floor(amount);
    var rest = amount - whole;
    for (var i = 0; i < FRACTIONS.length; i++) {
      if (Math.abs(rest - FRACTIONS[i][0]) < 0.03) {
        return (whole ? whole : '') + FRACTIONS[i][1];
      }
    }
    return String(Math.round(amount * 10) / 10);
  }

  function measure(ing) {
    var m = (ing.measures && (ing.measures.metric || ing.measures.us)) || null;
    if (m && m.amount) {
      return (pretty(m.amount) + ' ' + (m.unitShort || '')).trim();
    }
    /* Fall back to the original phrase minus the ingredient name. */
    var orig = String(ing.original || '').trim();
    var name = String(ing.name || '');
    if (orig && name && orig.toLowerCase().indexOf(name.toLowerCase()) > 0) {
      return orig.slice(0, orig.toLowerCase().indexOf(name.toLowerCase())).trim();
    }
    return '';
  }

  function shape(r) {
    var ingredients = (r.extendedIngredients || []).map(function (i) {
      return { name: i.nameClean || i.name || i.originalName || '', qty: measure(i) };
    }).filter(function (i) { return i.name; });

    var tags = (r.dishTypes || []).slice(0, 2).map(function (t) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    });
    if (r.readyInMinutes) tags.push(r.readyInMinutes + ' min');

    return {
      id: 'spn:' + r.id,
      title: r.title || 'Recipe',
      image: r.image || '',
      area: (r.cuisines || [])[0] || '',
      category: (r.dishTypes || [])[0]
        ? (r.dishTypes[0].charAt(0).toUpperCase() + r.dishTypes[0].slice(1)) : '',
      tags: tags,
      video: '',
      source: r.sourceUrl || r.spoonacularSourceUrl || '',
      ingredients: ingredients,
      steps: stepsFrom(r)
    };
  }

  window.SourceSpoon = {
    enabled: enabled,
    search: search,
    byId: byId,
    /* Exposed so api.js can tell whether a cuisine is worth asking
       about at all — see the cuisine list in the Worker. */
    knownCuisine: function (adj) {
      return /^(African|Asian|American|British|Cajun|Caribbean|Chinese|Eastern European|European|French|German|Greek|Indian|Irish|Italian|Japanese|Jewish|Korean|Latin American|Mediterranean|Mexican|Middle Eastern|Nordic|Southern|Spanish|Thai|Vietnamese)$/.test(adj || '');
    }
  };
})();
