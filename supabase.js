/* hochu — Supabase config.
 *
 * HOW TO TURN ON REAL ACCOUNTS (takes ~3 min):
 *   1. Create a free project at https://supabase.com  →  New project.
 *   2. In the project's SQL Editor, paste & run the SQL in SUPABASE_SETUP.md.
 *   3. Authentication → Providers → Email → turn OFF "Confirm email"
 *      (lets people log in instantly; optional but recommended for now).
 *   4. Project Settings → API → copy "Project URL" and the "anon public" key.
 *   5. Paste them below (replace the two YOUR_… placeholders), then commit & push.
 *
 * The anon key is SAFE to expose in the browser — it's designed to be public and
 * is protected by the database's Row Level Security rules. Never paste the
 * "service_role" key here.
 *
 * Until you fill these in, hochu runs in on-device mode (localStorage) exactly
 * as before — nothing breaks.
 */
window.SUPA = {
  url:  "YOUR_SUPABASE_URL",       // e.g. https://abcdefgh.supabase.co
  anon: "YOUR_SUPABASE_ANON_KEY",  // the long "anon public" key
};

window.SUPA_READY = !!(
  window.SUPA.url && window.SUPA.anon &&
  !window.SUPA.url.includes("YOUR_") && !window.SUPA.anon.includes("YOUR_") &&
  window.supabase && typeof window.supabase.createClient === "function"
);

window.sb = window.SUPA_READY
  ? window.supabase.createClient(window.SUPA.url, window.SUPA.anon)
  : null;
