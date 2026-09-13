/*
 * check-duplicates.mjs — catch a quote that has already been used.
 *
 * Why: quotes are added a few at a time over a year, so the realistic mistake
 * is not pasting the identical line twice — it is reusing the same quote in a
 * slightly different form months apart: different punctuation, a different
 * translation, or a longer passage that swallows a sentence already posted.
 * Exact-match checking would miss every one of those, so this compares
 * normalised text four ways.
 *
 * What it reports:
 *   DUPLICATE (exit 1) — identical once normalised, or one quote wholly
 *                        contained in another. Effectively the same post.
 *   SIMILAR   (exit 0) — high word-pair overlap, or a long shared run of
 *                        words. Usually a variant translation; worth a look,
 *                        but sometimes a legitimate coincidence.
 *   AUTHORS   (exit 0) — authors used more than once. Never a problem, just
 *                        useful to see the spread.
 *
 * Run before committing an add: `node scripts/check-duplicates.mjs`
 * Read-only, zero dependencies. Not wired into the deploy: a false positive
 * should never be able to block the daily release.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Thresholds, set from the archive rather than guessed. Measured across all
// pairs of the first 67 (genuinely distinct) quotes, the highest word-bigram
// overlap was 0.176 and a 5-word shared run produced zero false hits. So 0.35
// sits at twice the observed noise floor while still catching real variants —
// e.g. the Saunders and Lennon wordings of the "other plans" line score 0.55.
const DICE_WARN = 0.35;   // word-bigram overlap
const SHINGLE_LEN = 5;    // consecutive words shared verbatim
const MIN_CONTAIN = 20;   // ignore containment of very short fragments

// Strip everything that varies between renderings of the same line: case,
// curly vs straight quotes, dashes, accents, punctuation, spacing.
function normalize(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[‐-―]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (n) => n.split(" ").filter(Boolean);

function bigrams(ws) {
  const out = new Set();
  for (let i = 0; i < ws.length - 1; i++) out.add(ws[i] + " " + ws[i + 1]);
  return out;
}

// Sørensen–Dice over word bigrams: robust for sentences, cheap enough for
// every pair in a 365-quote archive.
function dice(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

// Longest run of consecutive words appearing in both.
function longestShingle(aw, bw) {
  const seen = new Set();
  for (let i = 0; i + SHINGLE_LEN <= aw.length; i++) {
    seen.add(aw.slice(i, i + SHINGLE_LEN).join(" "));
  }
  for (let i = 0; i + SHINGLE_LEN <= bw.length; i++) {
    const g = bw.slice(i, i + SHINGLE_LEN).join(" ");
    if (seen.has(g)) return g;
  }
  return null;
}

const clip = (s, n = 68) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const quotes = JSON.parse(await readFile(path.join(ROOT, "data", "quotes.json"), "utf8"));
const rows = quotes.map((q) => {
  const n = normalize(q.quote);
  const w = words(n);
  return { id: q.id, quote: q.quote, author: q.author, n, w, bg: bigrams(w) };
});

const duplicates = [];
const similar = [];

for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (!a.n || !b.n) continue;

    if (a.n === b.n) {
      duplicates.push({ a, b, why: "identical once normalised" });
      continue;
    }
    const [shortR, longR] = a.n.length <= b.n.length ? [a, b] : [b, a];
    if (shortR.n.length >= MIN_CONTAIN && longR.n.includes(shortR.n)) {
      duplicates.push({ a, b, why: `${shortR.id} is contained in ${longR.id}` });
      continue;
    }
    const d = dice(a.bg, b.bg);
    if (d >= DICE_WARN) {
      similar.push({ a, b, why: `${Math.round(d * 100)}% word-pair overlap` });
      continue;
    }
    const sh = longestShingle(a.w, b.w);
    if (sh) similar.push({ a, b, why: `shares "${clip(sh, 46)}"` });
  }
}

function show(list, label) {
  console.log(`${label} — ${list.length}\n`);
  for (const { a, b, why } of list) {
    console.log(`   ${a.id}  ${clip(a.quote)}`);
    console.log(`      ${a.author}`);
    console.log(`   ${b.id}  ${clip(b.quote)}`);
    console.log(`      ${b.author}`);
    console.log(`      -> ${why}\n`);
  }
}

console.log(`\nDaily Wisdom — duplicate check  (${rows.length} quotes, ${(rows.length * (rows.length - 1)) / 2} pairs)\n`);

if (duplicates.length) show(duplicates, "DUPLICATE");
if (similar.length) show(similar, "SIMILAR (review)");

// Text comparison cannot catch the same passage rendered in genuinely
// different words — two translations of Meditations 10.16 may share almost no
// vocabulary. The citation in the author field can catch it when the passage
// is cited precisely, so group by the work-and-locator portion.
const bySource = new Map();
for (const r of rows) {
  const s = String(r.author || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const comma = s.indexOf(",");
  if (comma < 0) continue; // no work cited, nothing to compare
  const key = normalize(s.slice(comma + 1));
  if (!key) continue;
  if (!bySource.has(key)) bySource.set(key, []);
  bySource.get(key).push(r);
}
const sourceRepeats = [...bySource.entries()].filter(([, rs]) => rs.length > 1);
if (sourceRepeats.length) {
  console.log(`SAME WORK CITED MORE THAN ONCE — ${sourceRepeats.length} (check it is not the same passage)\n`);
  for (const [, rs] of sourceRepeats) {
    const cited = String(rs[0].author).replace(/\s*\([^)]*\)\s*$/, "").trim();
    console.log(`   ${cited}`);
    rs.forEach((r) => console.log(`      ${r.id}  ${clip(r.quote, 58)}`));
    console.log("");
  }
}

const byAuthor = new Map();
for (const r of rows) {
  const key = String(r.author || "").split(",")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!byAuthor.has(key)) byAuthor.set(key, []);
  byAuthor.get(key).push(r.id);
}
const repeats = [...byAuthor.entries()].filter(([, ids]) => ids.length > 1).sort((x, y) => y[1].length - x[1].length);
if (repeats.length) {
  console.log(`AUTHORS USED MORE THAN ONCE — ${repeats.length}\n`);
  for (const [author, ids] of repeats) {
    console.log(`   ${String(ids.length).padStart(2)}x  ${author.padEnd(28)} ${ids.join(", ")}`);
  }
  console.log("");
}

if (!duplicates.length && !similar.length) console.log("No duplicates or near-duplicates found.\n");

process.exit(duplicates.length ? 1 : 0);
