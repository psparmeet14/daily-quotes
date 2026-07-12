/* Public runtime config for Daily Wisdom.
 *
 * These two values turn on the GLOBAL like counter (Supabase). Both are safe to
 * commit and expose in the browser — the anon key is Supabase's public key and,
 * with the Row Level Security in supabase/schema.sql, it can ONLY read like
 * counts and call the increment_like() function. Nothing else.
 *
 * Leave them empty to keep likes in local, per-browser mode.
 *
 * To enable global likes: paste your project's URL and anon (public) key, both
 * found in the Supabase dashboard under Project Settings → API.
 */
window.DW_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: ""   // the "anon" / "public" key (a long JWT string)
};
