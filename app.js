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

        UI.bubble('bot',
          'I could not find anything for that. Try a dish name like butter chicken, ' +
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
