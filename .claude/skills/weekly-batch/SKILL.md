---
name: weekly-batch
description: Prepare the next week of Daily Wisdom quotes from the 100-philosopher list — pick philosophers, find and verify passages word for word against public-domain texts, write descriptions, schedule them, and open a pull request for the owner to approve. Run by the weekly routine, or manually ("prepare the next batch").
---

# Weekly batch: 7 verified philosopher quotes, one pull request

You are preparing the next 7 days of quotes for dailywisdom365.com. The owner
reviews your pull request on a phone and merges it; the site then publishes
one quote per day at midnight IST on its own. Read `CLAUDE.md` first — its
rules for `tags` and `person` apply here.

The site's whole reputation is that its attributions are right. Several
quotes the owner prepared by hand this year needed corrections (a wrong
chapter, a line that was really someone's grandmother's, a "no source" quote
that turned out to have one). A wrong quote under a philosopher's name is the
worst outcome — worse than a short batch. When in doubt, leave it out.

## Hard rules

- Never push to `main`. Work on a new branch (e.g. `batch/<first-date>`; if
  your environment assigns a branch, use that one).
- Change only `data/quotes.json`, and only by running `scripts/schedule-batch.mjs`.
  Never edit an existing entry.
- One commit, message exactly `Queue quotes for <first-date> to <last-date>`.
- Every quote must match a text you actually fetched in this run, word for
  word. Quote sites (Goodreads, BrainyQuote, AZQuotes, Wikiquote without a
  checked citation, Pinterest, blogs) are never evidence.

## 1. Check whether a batch is needed

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git checkout origin/main -- data/quotes.json   # measure the queue as main has it
node scripts/queue-status.mjs
curl -s "https://api.github.com/repos/psparmeet14/daily-quotes/pulls?state=open"
git log --remotes=origin --not origin/main --format='%h %s (%D)' | grep 'Queue quotes for'
```

Stop, and say why in one line, if any of these hold:
- an open pull request's title starts with `Queue quotes for`, or the last
  command prints anything (a batch pushed but not yet merged) — a second
  batch would claim the same dates;
- `days` is 8 or more — the queue is healthy;
- `complete=true` — the 365-day cycle is full.

## 2. Pick the philosophers

```bash
node scripts/pick-philosophers.mjs 7 3
```

This returns 7 picks and 3 alternates (least-quoted first, random among
equals, nobody quoted in the last 21 days), each with suggested sources and a
`beware` list of famous lines that are *not* theirs. Use the picks; if one
yields nothing usable after a real attempt, swap in an alternate. Do not pick
names yourself.

## 3. Find and verify one passage per philosopher

For each philosopher:

1. **Fetch the text** to a file outside the repo (`curl -sL -o /tmp/texts/<name>.txt <url>`).
   Use a source from their entry, or another public-domain edition of the same work:
   - Project Gutenberg: `https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt`
   - archive.org scans — find the item, then its OCR text:
     `curl -s -G https://archive.org/advancedsearch.php --data-urlencode "q=title:(<title>) AND creator:(<translator>) AND mediatype:texts" --data-urlencode "fl[]=identifier" --data-urlencode "fl[]=year" --data-urlencode output=json`,
     then the `*_djvu.txt` file listed by `https://archive.org/metadata/<identifier>/files`,
     downloaded from `https://archive.org/download/<identifier>/<file>`. Check
     the volume: multi-volume works are often mislabelled.
   - Wikisource (API `action=parse`), classics.mit.edu (https only),
     LacusCurtius (penelope.uchicago.edu — Loeb translations up to 1929),
     suttacentral.net (API), accesstoinsight.org, api.banidb.com (Guru Granth Sahib page lookups).
   - **Blocked — don't use:** sacred-texts.com (Cloudflare challenge; get the
     same books from archive.org) and ctext.org (forbids automated access).
     accesstoinsight.org is unreachable from the cloud environment; use
     suttacentral.net for Buddhist texts.
   - Sites sometimes fail on the first request (Gutenberg timing out,
     Wikisource answering 429). Wait a few seconds and retry once before
     treating a source as unavailable.
2. **Choose a passage** that a reader looking to live better would value —
   character, work, time, wealth, health, courage, kindness, attention,
   purpose. It must make sense on its own, be 1–3 consecutive sentences, and
   ideally stay under 220 characters (hard limit 320; the share card shrinks
   the type beyond that). A strong lesser-known line beats a famous one; a
   famous one is fine if it is genuinely theirs. Nothing from their `beware` list.
3. **Verify it** with `node scripts/verify-quote.mjs /tmp/texts/<name>.txt "<quote>"`.
   It must print FOUND. The only edits allowed to the source wording:
   capitalise the first word, end at a semicolon or colon with a full stop,
   and run verse lines together as prose (lower-casing line-initial
   capitals). Never stitch non-adjacent sentences; mark any words cut from
   inside a sentence with "…". Take the book/chapter/section from the text
   itself, not from memory — and read the surrounding page, because the
   context is what the description is built on.
4. **Copyrighted works** (`copyrighted: true`): verify against a scan
   (archive.org full-text search, a publisher preview) and quote at most two
   sentences. If you cannot see the page, use an alternate.

If you cannot fetch a text, that philosopher is out for this week — use an
alternate rather than trusting memory.

## 4. Write the entry

```json
{
  "quote": "exact text as verified",
  "author": "Seneca, Moral Letters to Lucilius 13.4 (trans. Richard M. Gummere)",
  "person": "Seneca",
  "source": "https://the exact page or file you verified against",
  "description": "…",
  "tags": ["stoicism", "attention"]
}
```

- **author** — the citation shown on the site: `Name, Work Book.Section (trans. Translator, Year)`.
  Use the conventions already in `data/quotes.json` (e.g. `Confucius, Analects 15.29 (trans. James Legge)`).
- **person** — the exact `person` spelling from `data/philosophers.json`.
- **tags** — exactly two of the 14 themes in CLAUDE.md. `stoicism` only for
  actual Stoics (Zeno, Epictetus, Seneca, Marcus Aurelius).
- **source** — required; the URL the passage was matched against.
- **description** — the part readers come back for. Before writing, read the
  15 most recent descriptions in `data/quotes.json` and match that voice:
  - 3–6 sentences, roughly 300–520 characters, straight apostrophes.
  - Open with one concrete piece of context: who was writing, when, to whom,
    or what argument the passage sits in.
  - Then what a casual reading misses — the exact word that matters, the
    line that follows, the qualification the author makes.
  - End on a plain, practical point. No sermonising.
  - No exclamation marks, rhetorical-question chains, "timeless wisdom",
    "in today's world", emojis or lists.
  - Every factual claim must come from the text you fetched or a reference
    you actually opened. If you are not sure of a fact, leave it out.

  Two examples of the voice:

  > Marcus ran an empire through war and plague and still had to talk himself out of bed, in a private notebook he never intended anyone to read. That is most of why the passage survives. Two things get lost when it becomes wake-up-early fuel. The work of a human being, in his ethics, meant acting decently toward other people rather than clearing a to-do list. And a few lines on he grants plainly that rest is necessary, arguing only that we overshoot on it and stop short on everything else.

  > Chanakya is usually cast as the Indian Machiavelli, and the Arthashastra does cover espionage and assassination in some detail. Then it says this. The reasoning is partly self-interested, since a contented population is a stable one, which makes it leverage rather than sentiment. It still sets a test most people in charge of something would fail: does your welfare actually move with theirs, or only with your standing.

## 5. Schedule and check

Write the 7 entries as a JSON array to a file **outside the repo** (e.g.
`/tmp/batch.json`), then:

```bash
node scripts/schedule-batch.mjs /tmp/batch.json   # assigns the next 7 dates in a varied order
npm run check:dupes                               # DUPLICATE or AUTHOR NAMES problems: fix and redo
node scripts/check-batch.mjs origin/main          # must exit 0; its output is the PR description
```

If `check:dupes` reports DUPLICATE, replace that quote (restore
`data/quotes.json` with `git checkout data/quotes.json`, fix the batch file,
schedule again). SIMILAR is worth a look but not blocking.

## 6. Commit, push, open the pull request

```bash
git add data/quotes.json
git commit -m "Queue quotes for <first-date> to <last-date>"
git push -u origin HEAD
```

Open a pull request into `main` with the same title and the output of
`check-batch.mjs` as the description. If you cannot open pull requests from
your environment, pushing is enough: the "Check queued quotes" workflow opens
it automatically.

## 7. Report

Finish with a short summary: the pull request link, then one line per quote
(`date — person — first few words`), and any philosopher you swapped out and why.
