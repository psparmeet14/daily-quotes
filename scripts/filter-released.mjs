/*
 * filter-released.mjs — drop future-dated (queued) quotes from data/quotes.json.
 *
 * Why: quotes can be queued ahead of time by committing entries with future
 * dates. The repo keeps the full queue, but the DEPLOYED site must only serve
 * quotes released as of "today" — otherwise the archive, the Random button,
 * and the raw JSON would leak the whole week early. This runs in CI before
 * build-og.mjs (so no OG page is generated for an unreleased quote either),
 * rewriting quotes.json in the build workspace only; the repo file is
 * untouched.
 *
 * "Today" is computed in Asia/Kolkata (the owner's timezone) so the daily
 * 18:30 UTC cron in deploy.yml releases the new quote at midnight IST.
 * Overrides for testing: RELEASE_TODAY=YYYY-MM-DD, RELEASE_TZ=<IANA zone>.
 *
 * Zero dependencies. Run: `node scripts/filter-released.mjs`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(path.resolve(__dirname, ".."), "data", "quotes.json");

const TZ = process.env.RELEASE_TZ || "Asia/Kolkata";
// en-CA formats as YYYY-MM-DD, matching the quote ids.
const today = process.env.RELEASE_TODAY ||
  new Date().toLocaleDateString("en-CA", { timeZone: TZ });

const all = JSON.parse(await readFile(FILE, "utf8"));
const released = all.filter((q) => q.date <= today);

if (released.length === 0) {
  console.error(`filter-released: refusing to publish an empty site — no quote dated on or before ${today}`);
  process.exit(1);
}

await writeFile(FILE, JSON.stringify(released, null, 2) + "\n", "utf8");
console.log(`filter-released: ${released.length}/${all.length} quote(s) released as of ${today} (${TZ})`);
