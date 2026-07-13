# Daily Wisdom

One quote a day on life, happiness, success, wealth, health, and wellbeing.

**Live:** https://www.dailywisdom365.com/

A calm, editorial, zero-dependency static site. Quotes live in
[`data/quotes.json`](data/quotes.json) — no database, no CMS. Every push to
`main` auto-deploys to GitHub Pages via GitHub Actions.

## Adding a quote (daily workflow)

Tell Claude Code, in one message:

> Add today's quote: "&lt;quote&gt;" — &lt;author&gt;. Description: &lt;text&gt;. Image: &lt;path or none&gt;.

Claude appends the entry to `data/quotes.json`, copies/compresses any image into
`images/`, commits as `Add quote for <date>`, and pushes. The deploy runs
automatically.

## Structure

```
index.html            Today's quote (default view)
archive.html          All quotes, newest first
css/style.css         Visual system (ported from Claude Design reference)
js/app.js             App logic — data-driven from quotes.json
data/quotes.json      The quotes (source of truth)
images/               Optional per-quote images (named by date)
scripts/build-og.mjs  Pre-renders per-quote Open Graph pages into /q/ (CI)
og-default.png        Site-wide social share card
.github/workflows/    Pages deployment
```

## Sharing / Open Graph

Static per-quote pages are generated at build time under `/q/<date>.html`, each
carrying its own Open Graph / Twitter Card tags so shared links unfurl into a
rich preview. The **Share** button copies that link. Human visitors are bounced
to the SPA; crawlers read the meta tags.

## Roadmap

- **Phase 1 (done):** Site, deploy, today view, per-quote URLs, OG cards, daily workflow.
- **Phase 2:** Archive, random, image polish, share — *shipped alongside Phase 1.*
- **Phase 3:** Supabase-backed global like counts + analytics. *(Likes are currently local-only.)*
- **Phase 4:** Tags/filtering, "most loved", RSS.
