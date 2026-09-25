/* ============================================================
   Aaj kya banega? — rendering layer
   Builds DOM nodes. Everything user- or API-supplied goes in
   via textContent, never innerHTML, so no injection is possible.
   Exposes: window.RecipeUI
   ============================================================ */
(function () {
  'use strict';

  var chat = document.getElementById('chat');

  /* Tiny element helper: el('div', 'cls', 'text') */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function scrollToEnd() {
    requestAnimationFrame(function () {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  /* Remove the empty-state hero once the conversation starts. */
  function clearHero() {
    var hero = document.getElementById('hero');
    if (hero) hero.remove();
  }

  /* --- Plain message bubbles --------------------------------- */
  function bubble(who, text) {
    clearHero();
    var msg = el('div', 'msg ' + who);
    msg.appendChild(el('div', 'bubble', text));
    chat.appendChild(msg);
    scrollToEnd();
    return msg;
  }

  /* Animated "thinking" bubble; returns a handle with .remove() */
  function thinking() {
    clearHero();
    var msg = el('div', 'msg bot');
    var b = el('div', 'bubble');
    var dots = el('span', 'dots');
    dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
    b.appendChild(dots);
    b.setAttribute('aria-label', 'Looking up your recipe');
    msg.appendChild(b);
    chat.appendChild(msg);
    scrollToEnd();
    return msg;
  }

  /* --- Full recipe card ------------------------------------- */
  function recipeCard(r) {
    var card = el('article', 'recipe');

    /* Hero image + overlaid title and meta pills */
    var hero = el('div', 'recipe-hero');
    if (r.image) {
      var img = el('img');
      img.src = r.image;
      img.alt = r.title;
      img.loading = 'lazy';
      hero.appendChild(img);
    }
    var ht = el('div', 'recipe-hero-text');
    ht.appendChild(el('h3', null, r.title));

    var pills = el('div', 'pills');
    [r.area, r.category].concat(r.tags.slice(0, 2)).forEach(function (p) {
      if (p) pills.appendChild(el('span', 'pill', p));
    });
    pills.appendChild(el('span', 'pill', r.ingredients.length + ' ingredients'));
    ht.appendChild(pills);
    hero.appendChild(ht);
    card.appendChild(hero);

    var body = el('div', 'recipe-body');

    /* Ingredients */
    var ingSec = el('section', 'sec');
    ingSec.appendChild(el('h4', null, 'Ingredients'));
    var ul = el('ul', 'ing-list');
    r.ingredients.forEach(function (i) {
      var li = el('li', 'ing');
      if (i.qty) li.appendChild(el('span', 'ing-qty', i.qty));
      li.appendChild(el('span', null, i.name));
      ul.appendChild(li);
    });
    ingSec.appendChild(ul);
    body.appendChild(ingSec);

    /* Method */
    var stepSec = el('section', 'sec');
    stepSec.appendChild(el('h4', null, 'Method'));
    var ol = el('ol', 'steps');
    r.steps.forEach(function (s) {
      ol.appendChild(el('li', 'step', s));
    });
    stepSec.appendChild(ol);
    body.appendChild(stepSec);

    /* Links out — only rendered when the recipe actually has them */
    if (r.video || r.source) {
      var acts = el('div', 'actions');
      if (r.video) {
        var v = el('a', 'act primary', '▶  Watch the video');
        v.href = r.video; v.target = '_blank'; v.rel = 'noopener noreferrer';
        acts.appendChild(v);
      }
      if (r.source) {
        var s = el('a', 'act', '🔗  Original recipe');
        s.href = r.source; s.target = '_blank'; s.rel = 'noopener noreferrer';
        acts.appendChild(s);
      }
      body.appendChild(acts);
    }

    card.appendChild(body);
    return card;
  }

  /* Post an intro line plus the recipe card as one bot turn. */
  function showRecipe(intro, r) {
    clearHero();
    var msg = el('div', 'msg bot');
    msg.appendChild(el('div', 'bubble', intro));
    msg.appendChild(recipeCard(r));
    chat.appendChild(msg);
    scrollToEnd();
  }

  /* --- Choice grid ------------------------------------------ */
  /* onPick receives the chosen item's id and title. */
  function showChoices(intro, items, onPick) {
    clearHero();
    var msg = el('div', 'msg bot');
    msg.appendChild(el('div', 'bubble', intro));

    var grid = el('div', 'grid');
    items.forEach(function (it) {
      var tile = el('button', 'tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', 'Show the recipe for ' + it.title);
      if (it.image) {
        var img = el('img');
        img.src = it.image; img.alt = ''; img.loading = 'lazy';
        tile.appendChild(img);
      }
      tile.appendChild(el('span', null, it.title));
      tile.addEventListener('click', function () { onPick(it); });
      grid.appendChild(tile);
    });

    msg.appendChild(grid);
    chat.appendChild(msg);
    scrollToEnd();
  }

  window.RecipeUI = {
    bubble: bubble,
    thinking: thinking,
    showRecipe: showRecipe,
    showChoices: showChoices
  };
})();
