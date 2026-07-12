/*
 * build-og.mjs — pre-render one static HTML page per quote under /q/<date>.html.
 *
 * Why: the site is a static SPA that reads quotes.json at runtime, but social
 * crawlers (LinkedIn, X, Slack, Facebook) do NOT run JS. So each shared link
 * needs its own server-rendered <meta> tags to unfurl into a rich card. These
 * pages carry per-quote Open Graph / Twitter tags and then bounce a human
 * visitor to the SPA at index.html?date=<id>.
 *
 * Zero dependencies. Run: `node scripts/build-og.mjs` (also runs in CI).
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Canonical origin the pages advertise. Override with SITE_URL in CI if needed.
const SITE_URL = (process.env.SITE_URL || "https://psparmeet14.github.io/daily-quotes")
  .replace(/\/+$/, "");
const OG_IMAGE = `${SITE_URL}/og-default.png`;

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function page(q, num) {
  const title = `“${q.quote}” — ${q.author}`;
  const desc = q.description
    ? truncate(q.description, 200)
    : `Quote №${num} · Daily Wisdom — one quote a day on life, wealth, health, and wellbeing.`;
  const url = `${SITE_URL}/q/${q.id}.html`;
  // Always use the branded "A quote a day." card for social unfurls, even when
  // the quote has its own image — keeps every shared preview clean and on-brand.
  const image = OG_IMAGE;
  const appUrl = `../index.html?date=${encodeURIComponent(q.id)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · Daily Wisdom</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(url)}">

  <meta property="og:site_name" content="Daily Wisdom">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">

  <!-- Bounce human visitors to the app; crawlers keep the meta above. -->
  <meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
  <script>location.replace(${JSON.stringify(appUrl)});</script>
  <style>
    body{font-family:Georgia,serif;background:#F7F4ED;color:#29261F;margin:0;
      min-height:100dvh;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px}
    a{color:#A98B4F}
    @media (prefers-color-scheme:dark){body{background:#191713;color:#EAE4D6}}
  </style>
</head>
<body>
  <div>
    <blockquote style="font-size:24px;max-width:600px;line-height:1.4">${esc("“" + q.quote + "”")}</blockquote>
    <p style="letter-spacing:.1em;text-transform:uppercase;font-size:13px">— ${esc(q.author)}</p>
    <p><a href="${esc(appUrl)}">Continue to Daily Wisdom →</a></p>
  </div>
</body>
</html>
`;
}

async function main() {
  const raw = await readFile(path.join(ROOT, "data", "quotes.json"), "utf8");
  const quotes = JSON.parse(raw).slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  const outDir = path.join(ROOT, "q");
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    await writeFile(path.join(outDir, `${q.id}.html`), page(q, i + 1), "utf8");
  }

  console.log(`build-og: wrote ${quotes.length} page(s) to /q using SITE_URL=${SITE_URL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
