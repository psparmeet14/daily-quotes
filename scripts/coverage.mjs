/*
 * coverage.mjs — report which calendar days still need a quote.
 *
 * Why: the plan is one quote per calendar day for a full year, after which
 * the set repeats annually (see README). That makes "which days are still
 * empty?" the question that drives every batch. This prints a report: overall
 * progress, the uncovered days coming up soonest, and what is left month by
 * month so batches can be written a month at a time.
 *
 * The cycle runs 365 days from the FIRST entry in quotes.json. Finishing it
 * means covering every calendar day exactly once — including the days at the
 * start of the final month, which are easy to forget because they sit a year
 * after the launch date rather than at the end of the run.
 *
 * Read-only: touches nothing, exits 0 always. Zero dependencies.
 * Run: `node scripts/coverage.mjs` (or `--days 30` to widen the lookahead).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TZ = process.env.RELEASE_TZ || "Asia/Kolkata";
const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "UTC" });
const parse = (s) => new Date(s + "T00:00:00Z");
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const pretty = (s) =>
  parse(s).toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

const argDays = (() => {
  const i = process.argv.indexOf("--days");
  const n = i > -1 ? parseInt(process.argv[i + 1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 14;
})();

const quotes = JSON.parse(await readFile(path.join(ROOT, "data", "quotes.json"), "utf8"));
if (quotes.length === 0) {
  console.log("coverage: quotes.json is empty — nothing to report.");
  process.exit(0);
}

const dates = quotes.map((q) => q.date).sort();
const have = new Set(dates);
const start = parse(dates[0]);
const end = addDays(start, 364); // 365 days inclusive
const today = parse(new Date().toLocaleDateString("en-CA", { timeZone: TZ }));

// Walk the cycle once, bucketing every day.
const cycle = [];
for (let d = start; d <= end; d = addDays(d, 1)) cycle.push(ymd(d));
const missing = cycle.filter((d) => !have.has(d));
const covered = cycle.length - missing.length;
const outside = dates.filter((d) => !cycle.includes(d));

const pct = Math.round((covered / cycle.length) * 100);
const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "░");

console.log(`\nDaily Wisdom — calendar coverage`);
console.log(`Cycle: ${dates[0]} → ${ymd(end)}  (${cycle.length} days)\n`);
console.log(`  ${bar}  ${covered}/${cycle.length} covered (${pct}%)`);
console.log(`  ${missing.length} still to write\n`);

// The urgent part: days arriving soon with nothing in them.
const horizon = ymd(addDays(today, argDays - 1));
const soon = missing.filter((d) => d >= ymd(today) && d <= horizon);
if (soon.length) {
  console.log(`NEXT ${argDays} DAYS — ${soon.length} uncovered:`);
  soon.forEach((d) => console.log(`   ${d}  ${pretty(d)}${d === ymd(today) ? "   <- today" : ""}`));
  console.log("");
} else {
  console.log(`Next ${argDays} days: all covered.\n`);
}

// Anything already in the past and still empty can never be filled "on time",
// but it still leaves a hole in the repeating year, so call it out separately.
const pastGaps = missing.filter((d) => d < ymd(today));
if (pastGaps.length) {
  const shown = pastGaps.slice(0, 12);
  const rest = pastGaps.length - shown.length;
  console.log(`PAST GAPS — ${pastGaps.length} day(s) skipped (still leave a hole in the annual loop):`);
  console.log(`   ${shown.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}\n`);
}

// Remaining work grouped by month, so batches can be written a month at a time.
const byMonth = new Map();
for (const d of missing) {
  const key = d.slice(0, 7);
  if (!byMonth.has(key)) byMonth.set(key, []);
  byMonth.get(key).push(Number(d.slice(8)));
}
if (byMonth.size) {
  console.log("REMAINING BY MONTH:");
  for (const [month, days] of [...byMonth.entries()].sort()) {
    const label = parse(month + "-01").toLocaleDateString("en-GB", {
      timeZone: "UTC", month: "long", year: "numeric",
    });
    const isTail = month === ymd(end).slice(0, 7);
    const note = isTail ? "   <- closes the annual loop" : "";
    console.log(`   ${label.padEnd(18)} ${String(days.length).padStart(3)} day(s)${note}`);
  }
  console.log("");
}

if (outside.length) {
  const word = outside.length === 1 ? "entry" : "entries";
  console.log(`NOTE: ${outside.length} ${word} dated outside the cycle: ${outside.join(", ")}\n`);
}

if (missing.length === 0) {
  console.log("The year is complete. Every calendar day has a quote.\n");
}
