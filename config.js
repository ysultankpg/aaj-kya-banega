/* ============================================================
   Aaj kya banega? — configuration

   proxy: the Cloudflare Worker that fronts Spoonacular. See
   worker/README.md for how to deploy it and where the URL comes
   from. No trailing slash.

   Leave it as an empty string and the app runs on TheMealDB
   alone — everything still works, coverage is just narrower. No
   API key ever appears in this file or anywhere else in the
   browser; the Worker holds it.
   ============================================================ */
window.RecipeConfig = {
  proxy: ''
};
