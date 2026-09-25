/* ============================================================
   Aaj kya banega? — question → intent
   Kept separate from api.js so the routing rules stay readable.
   Exposes: window.RecipeIntent = { parse }
   ============================================================ */
(function () {
  'use strict';

  /* TheMealDB quirk, verified against the live API:
     list.php?a=list returns DEMONYMS ("Indian", "French"), but
     filter.php?a= matches COUNTRY names. For most cuisines both work,
     but Indian, French, American, Dutch and Bangladeshi return nothing
     as demonyms — which is why "indian breakfast" found nothing.
     So every alias resolves to the country name; the adjective is kept
     only for wording the reply. */
  var AREAS = {
    indian:['India','Indian'], desi:['India','Indian'],
    french:['France','French'], american:['United States','American'],
    dutch:['Netherlands','Dutch'], bangladeshi:['Bangladesh','Bangladeshi'],
    british:['United Kingdom','British'], english:['United Kingdom','British'],
    thai:['Thailand','Thai'], italian:['Italy','Italian'],
    chinese:['China','Chinese'], japanese:['Japan','Japanese'],
    mexican:['Mexico','Mexican'], greek:['Greece','Greek'],
    spanish:['Spain','Spanish'], turkish:['Turkey','Turkish'],
    moroccan:['Morocco','Moroccan'], vietnamese:['Vietnam','Vietnamese'],
    malaysian:['Malaysia','Malaysian'], filipino:['Philippines','Filipino'],
    egyptian:['Egypt','Egyptian'], jamaican:['Jamaica','Jamaican'],
    russian:['Russia','Russian'], polish:['Poland','Polish'],
    irish:['Ireland','Irish'], canadian:['Canada','Canadian'],
    portuguese:['Portugal','Portuguese'], croatian:['Croatia','Croatian'],
    kenyan:['Kenya','Kenyan'], tunisian:['Tunisia','Tunisian'],
    ukrainian:['Ukraine','Ukrainian'], pakistani:['Pakistan','Pakistani'],
    nepalese:['Nepal','Nepalese'], srilankan:['Sri Lanka','Sri Lankan']
  };

  var CATEGORIES = {
    dessert:'Dessert', sweet:'Dessert', pudding:'Dessert', cake:'Dessert',
    vegetarian:'Vegetarian', veggie:'Vegetarian', vegan:'Vegan',
    seafood:'Seafood', fish:'Seafood', prawn:'Seafood',
    chicken:'Chicken', beef:'Beef', pork:'Pork', lamb:'Lamb',
    pasta:'Pasta', breakfast:'Breakfast', brunch:'Breakfast',
    side:'Side', starter:'Starter', appetizer:'Starter',
    appetiser:'Starter', snack:'Starter', goat:'Goat'
  };

  var STOP = new RegExp(
    '\\b(how|do|i|you|to|can|could|would|please|make|cook|prepare|a|an|the|' +
    'recipe|recipes|for|of|me|give|show|find|get|want|need|some|any|dish|' +
    'dishes|food|meal|meals|is|whats|what|s|there|tell|about|with|using|use|' +
    'up|got|have|ive|best|good|easy|quick|simple|step|steps|by|suggest|' +
    'something|instructions|cuisine|style)\\b',
    'gi');

  function normalise(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  }

  /* Returns one of:
       {kind:'random'}
       {kind:'area',      value, adj, label}
       {kind:'areacat',   value, cat, adj, label}
       {kind:'category',  value, label}
       {kind:'ingredient',value, label}
       {kind:'name',      value, label}                                  */
  function parse(question) {
    var q = normalise(question);
    // "sri lankan" is two words; join it so the alias table can see it.
    q = q.replace(/\bsri\s+lankan?\b/g, 'srilankan');
    var words = q.split(/\s+/).filter(Boolean);

    if (/\b(surprise|random|anything|whatever|inspire)\b/.test(q)) {
      return { kind: 'random', label: 'something to surprise you' };
    }

    var area = null, cat = null, i;
    for (i = 0; i < words.length; i++) {
      if (!area && AREAS[words[i]]) area = AREAS[words[i]];
      if (!cat && CATEGORIES[words[i]]) cat = CATEGORIES[words[i]];
    }

    var core = q.replace(STOP, ' ').replace(/\s+/g, ' ').trim();

    // Cuisine + category together ("indian breakfast") — worth an
    // intersection rather than throwing one of the two away.
    if (area && cat) {
      return { kind: 'areacat', value: area[0], adj: area[1], cat: cat,
               label: area[1] + ' ' + cat.toLowerCase() };
    }
    if (area) {
      return { kind: 'area', value: area[0], adj: area[1],
               label: area[1] + ' dishes' };
    }

    if (/\b(?:with|using|from|out of|i have|ive got|have got)\b/.test(
          normalise(question)) && core) {
      return { kind: 'ingredient', value: core.split(' ')[0],
               label: 'recipes using ' + core };
    }

    // A lone category word means "browse that category". More than one
    // word left is probably a dish name ("chicken biryani").
    if (cat && core.split(' ').length <= 1) {
      return { kind: 'category', value: cat, label: cat.toLowerCase() + ' recipes' };
    }

    if (core) return { kind: 'name', value: core, label: core };
    return { kind: 'random', label: 'something tasty' };
  }

  window.RecipeIntent = { parse: parse };
})();
