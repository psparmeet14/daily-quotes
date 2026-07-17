# Daily Wisdom — Daily Quotes Website

## What this project is
A daily-quote website focused on life improvement, happiness, success, wealth, finance, health & fitness, and overall wellbeing. One quote is added per day by the owner (Parmeet). The goal is to **grow an audience**, so shareability is a first-class feature, not an afterthought.

- **Owner GitHub account:** https://github.com/psparmeet14
- **Repo name:** daily-quotes (create under psparmeet14)
- **Hosting:** GitHub Pages, auto-deployed via GitHub Actions on every push to `main`
- **Live URL (canonical):** https://www.dailywisdom365.com/ — custom domain, served at the root. The apex `dailywisdom365.com` and the old `psparmeet14.github.io/daily-quotes` URL both 301-redirect here. The domain is set in the repo's Pages settings AND in the `CNAME` file at the repo root; keep both, and always use the www domain in OG tags, canonical links, and generated share pages.

## Core product behavior
1. **Default view = today's quote.** Large, elegant typography. Shows today's date and a live-updating time.
2. **Archive page** — all past quotes, newest first, as a clean card grid (date, quote preview, like count).
3. **Random button** — loads a random past quote with a smooth transition.
4. **Optional image per quote** — displayed tastefully below/beside the quote when present.
5. **Optional description** — 2–3 sentence reflection under the quote in smaller muted text.
6. **Like/heart button** per quote with live count (backend: Supabase, see below).
7. **Per-quote shareable URLs** — e.g. `?date=2026-07-11` or `#2026-07-11`. Every quote must be individually linkable.
8. **Open Graph / Twitter Card meta tags** — when a quote link is shared on LinkedIn/X, it must unfurl into a rich preview card (quote text + image). This is the primary growth mechanism. Note: since this is a static SPA reading JSON, per-quote OG tags require either pre-generated static pages per quote (preferred — generate them in the GitHub Actions build step) or a default site-wide card as fallback in Phase 1.
9. **Quote numbering** — display "Quote #N" to signal consistency/streak.
10. **Edge case:** if no quote exists for today's date, show the most recent quote instead of an empty page.

## Architecture decisions (already made — do not revisit)
- **No database for quotes.** Quotes live in `data/quotes.json` in the repo, version-controlled.
- **No CMS / admin panel.** Quotes are added via Claude Code (see daily workflow below).
- **Frontend:** Keep it simple — vanilla HTML/CSS/JS is fine; a lightweight build step is acceptable if it enables per-quote OG pages. No heavy frameworks.
- **Likes backend:** Supabase free tier. One table: `likes (quote_id text primary key, count int)`. Increment via an atomic Postgres function exposed through Supabase's REST API. Enable Row Level Security: anonymous users can only call the increment function and read counts. Use a localStorage flag to prevent repeat likes from the same browser (good enough; don't over-engineer).
- **Analytics:** Add a lightweight analytics script (Plausible/Umami preferred, GA acceptable). Likes measure per-quote engagement; analytics measures traffic and sources.

## Quote data schema (`data/quotes.json`)
```json
[
  {
    "id": "2026-07-11",
    "date": "2026-07-11",
    "quote": "The obstacle is the way.",
    "author": "Marcus Aurelius",
    "description": "Optional 2–3 sentence reflection.",
    "image": "images/2026-07-11.jpg",
    "tags": ["stoicism", "mindset"]
  }
]
```
- `id` = date (YYYY-MM-DD). Guarantees uniqueness and natural ordering.
- `description`, `image`, `tags` are optional (omit or null).
- Images live in `/images`, named by date, compressed to under ~200KB before commit.

## Repo structure
```
daily-quotes/
├── CLAUDE.md
├── CNAME               # Custom domain (www.dailywisdom365.com) — do not delete
├── index.html          # Today's quote (default)
├── archive.html        # All quotes
├── css/style.css
├── js/app.js
├── data/quotes.json
├── images/
└── .github/workflows/deploy.yml
```

## Design
The visual design was produced with Claude Design and is available in the `/design-reference` folder (if present). Match it faithfully: calm, premium, editorial aesthetic — warm off-white background, deep charcoal text, one muted accent (gold or sage), large serif quote typography, dark mode support, mobile-first. The quote is the hero; no clutter.

## Daily workflow (the most important UX in this repo)
The owner adds a quote by telling Claude Code something like:
> "Add today's quote: '<quote>' — <author>. Description: <text>. Image: <path or none>."

Claude Code must then:
1. Append the entry to `data/quotes.json` (validate JSON, ensure no duplicate date).
2. If an image is provided, copy it to `/images/<date>.<ext>` and compress/resize if large.
3. Regenerate any per-quote OG pages if that build step exists.
4. Commit with message `Add quote for <date>` and push to `main`.
5. Confirm the deploy triggered.

Keep this workflow to a single message from the owner. Never require multiple back-and-forth steps for a routine daily add.

### Scheduling ahead (batch adds)
The owner may send several quotes at once to cover upcoming days. Append them all to `data/quotes.json` with their future dates (same validation as a daily add), commit once as `Queue quotes for <first-date> to <last-date>`, and push. The deployed site never reveals a quote early: `scripts/filter-released.mjs` drops future-dated entries at build time (so they're absent from the served JSON, the archive, Random, and `/q/` OG pages), and a daily cron in `deploy.yml` (18:30 UTC = midnight IST) redeploys so each quote goes live on its own day. Local preview shows the full queue — it reads the unfiltered repo file.

## Build phases
- **Phase 1 (MVP):** Repo + Pages deployment, today-view with date/time, quotes.json, daily add workflow, per-quote URLs, OG meta tags (at minimum site-wide card; per-quote cards if feasible).
- **Phase 2:** Archive page, random button, image support polish, share button (copy link).
- **Phase 3:** Supabase likes + analytics script.
- **Phase 4 (later):** Tags/filtering, "most loved" section driven by like counts, RSS feed.

## Conventions
- Conventional, readable commit messages.
- No secrets in the repo. The Supabase anon key is safe to expose client-side (that's its purpose), but nothing else.
- Test the site locally (simple HTTP server) before pushing when making structural changes.
- Keep dependencies near zero. Prefer platform features over libraries.
