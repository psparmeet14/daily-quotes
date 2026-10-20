/*
 * schedule-batch.mjs — put a prepared batch of quotes on the calendar.
 *
 * Takes drafted entries (no id or date) and assigns them to the days right
 * after the last queued quote, in a random order that keeps the archive
 * varied: no two consecutive days share a theme, and nobody returns within
 * 21 days. The entries are appended to data/quotes.json in the file's own
 * layout — one field per line, tags on one line — so the diff is a pure
 * addition, and the release filter then publishes one per day.
 *
 * Usage: node scripts/schedule-batch.mjs <batch.json>
 *   batch.json: [{ quote, author, person, source, description, tags }, ...]
 * Run check-duplicates.mjs afterwards; this only does the calendar.
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { AUTHOR_GAP_DAYS, QUOTES_FILE, addDays, cycleEnd, daysBetween, lastDate, lastUsedBy } from "./lib/calendar.mjs";

const batchFile = process.argv[2];
if (!batchFile) {
  console.error("usage: node scripts/schedule-batch.mjs <batch.json>");
  process.exit(2);
}

const src = await readFile(QUOTES_FILE, "utf8");
const quotes = JSON.parse(src);
const batch = JSON.parse(await readFile(batchFile, "utf8"));

const problems = [];
batch.forEach((e, i) => {
  const at = `entry ${i + 1}`;
  for (const k of ["quote", "author", "description", "source"]) {
    if (typeof e[k] !== "string" || !e[k].trim()) problems.push(`${at}: missing ${k}`);
  }
  if (!("person" in e) || (e.person !== null && typeof e.person !== "string")) problems.push(`${at}: person must be a name or null`);
  if (!Array.isArray(e.tags) || e.tags.length !== 2) problems.push(`${at}: needs exactly two tags`);
  if (typeof e.source === "string" && !/^https?:\/\//.test(e.source)) problems.push(`${at}: source must be a URL`);
  if ("id" in e || "date" in e) problems.push(`${at}: leave id/date out — this script assigns them`);
});
const people = batch.map((e) => e.person).filter(Boolean);
if (new Set(people).size !== people.length) problems.push("the same person appears twice in one batch");
if (problems.length) {
  console.error("schedule-batch: " + problems.join("\n  "));
  process.exit(1);
}

const last = lastDate(quotes);
const start = addDays(last, 1);
const end = cycleEnd(quotes);
if (daysBetween(start, end) + 1 < batch.length) {
  console.error(`schedule-batch: only ${daysBetween(start, end) + 1} day(s) left in the cycle (ends ${end})`);
  process.exit(1);
}

const lastUsed = lastUsedBy(quotes);
const prevTags = (quotes.find((q) => q.date === last) || {}).tags || [];
const dates = batch.map((_, i) => addDays(start, i));

function fits(order, themes) {
  let before = prevTags;
  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    if (e.person && lastUsed.has(e.person) && daysBetween(lastUsed.get(e.person), dates[i]) < AUTHOR_GAP_DAYS) return false;
    if (themes && e.tags.some((t) => before.includes(t))) return false;
    before = e.tags;
  }
  return true;
}

function shuffled(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// Random restarts: 7 entries have 5,040 orders, so this finds a valid one
// almost at once. Themes are relaxed only if no order can satisfy them.
let order = null;
let themesKept = true;
for (const themes of [true, false]) {
  for (let t = 0; t < 50000 && !order; t++) {
    const o = shuffled(batch);
    if (fits(o, themes)) order = o;
  }
  if (order) { themesKept = themes; break; }
}
if (!order) {
  console.error(`schedule-batch: no order keeps every author ${AUTHOR_GAP_DAYS}+ days from their last quote — swap a philosopher`);
  process.exit(1);
}

const S = JSON.stringify;
const block = order.map((e, i) => [
  "  {",
  `    "id": ${S(dates[i])},`,
  `    "date": ${S(dates[i])},`,
  `    "quote": ${S(e.quote)},`,
  `    "author": ${S(e.author)},`,
  `    "person": ${S(e.person)},`,
  `    "source": ${S(e.source)},`,
  `    "description": ${S(e.description)},`,
  `    "image": null,`,
  `    "tags": [${e.tags.map(S).join(", ")}]`,
  "  }",
].join("\n")).join(",\n");

if (!/\n  \}\n\]\s*$/.test(src)) {
  console.error("schedule-batch: data/quotes.json does not end the way this script expects");
  process.exit(1);
}
const out = src.replace(/\n  \}\n\]\s*$/, "\n  },\n" + block + "\n]\n");
JSON.parse(out);
await writeFile(QUOTES_FILE, out, "utf8");

console.log(`schedule-batch: queued ${order.length} quote(s), ${dates[0]} to ${dates.at(-1)}`);
if (!themesKept) console.log("  note: no order avoided a shared theme on consecutive days; scheduled anyway");
order.forEach((e, i) => console.log(`  ${dates[i]}  ${(e.person || "Unknown origin").padEnd(28)} ${e.tags.join(", ")}`));
