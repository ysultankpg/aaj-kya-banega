/* ============================================================
   Aaj kya banega? — controller
   Wires the composer, chips and theme toggle to API + UI.
   ============================================================ */
(function () {
  'use strict';

  var API = window.RecipeAPI;
  var UI = window.RecipeUI;

  var form = document.getElementById('composer');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var themeBtn = document.getElementById('themeBtn');
  var themeIcon = document.getElementById('themeIcon');
  var toTopBtn = document.getElementById('toTopBtn');

  var busy = false;

  /* --- Back to top -----------------------------------------
     Shown only once there is a meaningful amount to scroll back
     over. While hidden the button is visibility:hidden, so it is
     also removed from the tab order to avoid a focus trap on an
     invisible control.                                        */
  function syncToTop() {
    var show = window.scrollY > 260;
    toTopBtn.classList.toggle('show', show);
    if (show) {
      toTopBtn.removeAttribute('tabindex');
    } else {
      toTopBtn.setAttribute('tabindex', '-1');
    }
  }

  toTopBtn.setAttribute('tabindex', '-1');
  window.addEventListener('scroll', syncToTop, { passive: true });
  window.addEventListener('resize', syncToTop);

  toTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* --- Theme toggle ----------------------------------------
     Persisted in localStorage; falls back to the OS setting
     when nothing has been chosen.                            */
  function currentTheme() {
    var saved = null;
    try { saved = localStorage.getItem('aajkyabanega-theme'); } catch (e) { /* private mode */ }
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  applyTheme(currentTheme());

  themeBtn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('aajkyabanega-theme', next); } catch (e) { /* ignore */ }
  });

  /* --- Intro lines, varied so replies do not feel canned ----
     Every line must be honest about what was actually found:
     a grid of eight dishes must never be introduced as "the recipe
     for X". 'matches' and 'fallback' exist for exactly that.      */
  function introFor(intent, title) {
    // 'wider' / 'widerarea' mean the answer came from the large index
    // rather than the curated one. Worth saying: those recipes link out
    // to their original author and have no video.
    if (intent.kind === 'wider') {
      return 'Not in my curated set, so I searched the wider index for ' +
             intent.label + ':';
    }
    if (intent.kind === 'widerarea') {
      return 'My curated set is thin on ' + intent.adj +
             ' food, so here is ' + intent.label + ' from the wider index:';
    }
    if (intent.kind === 'closest') {
      return 'No exact match for ' + intent.label + ', but searching ' +
             intent.used + ' turns this up:';
    }
    if (intent.kind === 'nooverlap') {
      return 'Nothing in the collection is both ' + intent.adj + ' and ' +
             intent.cat.toLowerCase() + '. Here is the ' + intent.adj +
             ' selection instead:';
    }
    if (intent.kind === 'fallback') {
      return 'I could not find a dish called ' + intent.label +
             '. Here is what I have using ' + intent.used + ' — tap one for the method:';
    }
    if (intent.kind === 'matches') {
      return 'A few things match ' + title + '. Tap one for the full recipe:';
    }
    var lines = {
      random: ['Here is something worth trying —', 'Rolling the dice for you —'],
      name: ['Found it. Here is how to make ' + title + '.',
             'Here is the full recipe for ' + title + '.'],
      area: ['Some ' + title + ' worth cooking. Pick one for the full recipe:'],
      areacat: ['Here is the ' + title + ' I have. Tap one for the method:'],
      category: ['Here are a few ' + title + '. Tap one for the method:'],
      ingredient: ['These use what you have. Tap one for the full recipe:']
    };
    var set = lines[intent.kind] || lines.name;
    return set[Math.floor(Math.random() * set.length)];
  }

  /* --- Lock/unlock the composer while a request is in flight - */
  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
    if (!state) input.focus();
  }

  /* --- Load and display one recipe by id -------------------- */
  function openRecipe(item) {
    if (busy) return;
    setBusy(true);
    UI.bubble('user', item.title);
    var wait = UI.thinking();

    API.byId(item.id)
      .then(function (r) {
        wait.remove();
        UI.showRecipe('Here is how to make ' + r.title + '.', r);
      })
      .catch(function () {
        wait.remove();
        UI.bubble('bot', 'I could not load that one. Try another, or ask me something else.');
      })
      .then(function () { setBusy(false); });
  }

  /* --- Main ask flow ---------------------------------------- */
  function ask(question) {
    if (busy) return;
    var q = String(question || '').trim();
    if (!q) return;

    setBusy(true);
    UI.bubble('user', q);
    var wait = UI.thinking();

    API.ask(q)
      .then(function (res) {
        wait.remove();

        if (res.type === 'recipe') {
          UI.showRecipe(introFor(res.intent, res.recipe.title), res.recipe);
          return;
        }

        if (res.type === 'choices') {
          UI.showChoices(introFor(res.intent, res.intent.label), res.items, openRecipe);
          return;
        }

        // Be specific about WHY nothing came back. An empty cuisine is a
        // gap in the collection, not a misunderstood question.
        var wide = window.SourceSpoon && window.SourceSpoon.enabled();
        if (res.intent && (res.intent.kind === 'area' || res.intent.kind === 'areacat')) {
          UI.bubble('bot', 'I have no ' + res.intent.adj + ' dishes' +
            (wide ? ' in either index' : ' yet') +
            '. Try another cuisine, or name a dish directly.');
          return;
        }
        UI.bubble('bot',
          'I could not find anything for that. Try a dish name like lamb biryani, ' +
          'an ingredient like paneer, or a cuisine like Thai.');
      })
      .catch(function (err) {
        wait.remove();
        // Distinguish a genuinely offline browser from a service error.
        var offline = !navigator.onLine;
        UI.bubble('bot', offline
          ? 'You appear to be offline. Reconnect and ask me again.'
          : 'The recipe service did not respond. Give it another go in a moment.');
      })
      .then(function () { setBusy(false); });
  }

  /* --- Events ----------------------------------------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value;
    input.value = '';
    ask(q);
  });

  // Example chips fire a prepared question.
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () { ask(chip.dataset.q); });
  });

  input.focus();
})();
