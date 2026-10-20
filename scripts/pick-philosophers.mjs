/*
 * pick-philosophers.mjs — choose who the next weekly batch draws from.
 *
 * Least-quoted first, so the 100 names in data/philosophers.json fill up
 * evenly over the year, and random among equals — that is where the
 * "random philosopher each day" comes from. Nobody quoted in the 21 days
 * before the batch starts is eligible. To keep a week varied it takes at
 * most two from one tradition and one whose works are still in copyright
 * (those are slower to verify). Alternates are listed in case a pick yields
 * nothing worth posting.
 *
 * Usage: node scripts/pick-philosophers.mjs [count=7] [alternates=3]
 * Read-only; prints JSON for the weekly-batch procedure to work from.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import { ROOT, AUTHOR_GAP_DAYS, addDays, cycleEnd, daysBetween, lastDate, lastUsedBy, readQuotes } from "./lib/calendar.mjs";

const want = Number(process.argv[2] || 7);
const alternates = Number(process.argv[3] || 3);

const quotes = await readQuotes();
const roster = JSON.parse(await readFile(path.join(ROOT, "data", "philosophers.json"), "utf8")).philosophers;

const start = addDays(lastDate(quotes), 1);
const end = cycleEnd(quotes);
const room = daysBetween(start, end) + 1;
if (room <= 0) {
  console.log(JSON.stringify({ batchStart: start, cycleEnd: end, picks: [], note: "The 365-day cycle is full." }, null, 2));
  process.exit(0);
}
const count = Math.min(want, room);

const uses = new Map();
for (const q of quotes) if (q.person) uses.set(q.person, (uses.get(q.person) || 0) + 1);
const lastUsed = lastUsedBy(quotes);
const cutoff = addDays(start, -AUTHOR_GAP_DAYS);

// Shuffle, then a stable sort by use count: random order within each count.
const pool = roster.filter((p) => !(lastUsed.get(p.person) > cutoff));
for (let i = pool.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
pool.sort((a, b) => (uses.get(a.person) || 0) - (uses.get(b.person) || 0));

const family = (p) => p.tradition.split(/[ (]/)[0];
const chosen = [];
const perFamily = new Map();
let copyrighted = 0;
for (const p of pool) {
  if (chosen.length >= count + alternates) break;
  const f = family(p);
  if ((perFamily.get(f) || 0) >= 2) continue;
  if (p.copyrighted && copyrighted >= 1) continue;
  chosen.push(p);
  perFamily.set(f, (perFamily.get(f) || 0) + 1);
  if (p.copyrighted) copyrighted++;
}

const view = (p) => ({
  person: p.person,
  quotedSoFar: uses.get(p.person) || 0,
  lastQuoted: lastUsed.get(p.person) || null,
  tradition: p.tradition,
  sources: p.sources,
  ...(p.copyrighted ? { copyrighted: true } : {}),
  ...(p.beware ? { beware: p.beware } : {}),
  ...(p.notes ? { notes: p.notes } : {}),
});

console.log(JSON.stringify({
  batchStart: start,
  batchEnd: addDays(start, count - 1),
  cycleEnd: end,
  picks: chosen.slice(0, count).map(view),
  alternates: chosen.slice(count).map(view),
}, null, 2));
