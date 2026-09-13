/*
 * build-tags.mjs — one static page per theme, at /t/<theme>.html.
 *
 * Why static rather than only the in-page filter: the archive filter is
 * client-side, so a crawler sees nothing. These pages give each theme a real
 * indexable URL ("persistence quotes") carrying the quote list in the HTML,
 * plus its own Open Graph card so a theme link unfurls when shared. Same
 * pattern as /q/: crawlers read the markup, humans are bounced into the app
 * at archive.html?tag=<theme> where the interactive filter takes over.
 *
 * Also renders a per-theme share card into /t/img/<theme>.png.
 *
 * Run after filter-released.mjs so unreleased quotes are not counted or
 * listed. Output lives under /t (gitignored). Zero runtime cost to the site.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONTS = path.join(__dirname, "fonts");

const SITE_URL = (process.env.SITE_URL || "https://www.dailywisdom365.com").replace(/\/+$/, "");

const font = async (f) => await readFile(path.join(FONTS, f));
const fonts = [
  { name: "Newsreader", data: await font("nr-400-normal.woff"), weight: 400, style: "normal" },
  { name: "Newsreader", data: await font("nr-500-normal.woff"), weight: 500, style: "normal" },
  { name: "Newsreader", data: await font("nr-600-normal.woff"), weight: 600, style: "normal" },
];

const BG = "#F7F4ED", INK = "#29261F", GOLD = "#A98B4F", MUTE = "#6B6357";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A short line of copy per theme, so each page has its own description rather
// than fourteen near-identical ones — thin duplicate pages are worth avoiding.
const BLURB = {
  stoicism: "Marcus Aurelius, Seneca, Epictetus and the Stoic idea that judgement, not circumstance, is where your power sits.",
  discipline: "Quotes on self-command: choosing the harder thing now so the easier life arrives later.",
  persistence: "On failing, continuing, and the unglamorous business of not stopping.",
  purpose: "Why you are doing it — the aim that survives the days you do not feel like it.",
  time: "On mortality, urgency, and the one resource nobody gets more of.",
  wealth: "Money as an instrument rather than a scoreboard, and what it can and cannot buy.",
  health: "The body as the thing every other plan quietly assumes.",
  knowledge: "Learning, thinking clearly, and knowing the limits of what you know.",
  humility: "On being willing to be a beginner, and on accurate self-assessment as a skill.",
  courage: "Acting while afraid — what the word actually means to people who needed it.",
  kindness: "Going first: quotes on how we owe each other ordinary decency.",
  action: "Closing the gap between understanding a thing and doing it.",
  attention: "Stillness, focus, and noticing the life that is happening now.",
  character: "Who you are when it costs something.",
};

function card(theme, count) {
  return {
    type: "div",
    props: {
      style: {
        width: 1200, height: 630, display: "flex", flexDirection: "column",
        justifyContent: "space-between", backgroundColor: BG, color: INK,
        padding: "68px 80px", fontFamily: "Newsreader",
      },
      children: [
        { type: "div", props: {
          style: { display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: GOLD, fontWeight: 600 },
          children: "Daily Wisdom",
        }},
        { type: "div", props: {
          style: { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" },
          children: [
            { type: "div", props: {
              style: { display: "flex", fontSize: 92, fontWeight: 500, letterSpacing: -1 },
              children: cap(theme),
            }},
            { type: "div", props: {
              style: { display: "flex", fontSize: 30, color: MUTE, marginTop: 14 },
              children: `${count} quote${count === 1 ? "" : "s"}`,
            }},
          ],
        }},
        { type: "div", props: {
          style: { display: "flex", flexDirection: "column" },
          children: [
            { type: "div", props: { style: { display: "flex", width: 64, height: 3, backgroundColor: GOLD, marginBottom: 20 } } },
            { type: "div", props: {
              style: { display: "flex", fontSize: 22, letterSpacing: 1.5, textTransform: "uppercase", color: MUTE, fontWeight: 500 },
              children: "dailywisdom365.com",
            }},
          ],
        }},
      ],
    },
  };
}

function page(theme, list) {
  const title = `${cap(theme)} quotes · Daily Wisdom`;
  const desc = BLURB[theme] || `Every Daily Wisdom quote tagged ${theme}.`;
  const url = `${SITE_URL}/t/${theme}.html`;
  const image = `${SITE_URL}/t/img/${theme}.png`;
  const appUrl = `../archive.html?tag=${encodeURIComponent(theme)}`;

  // Newest first, matching the archive.
  const items = list.slice().reverse().map((q) => `      <li>
        <a href="../q/${esc(q.id)}.html">${esc("“" + q.quote + "”")}</a>
        <span>— ${esc(q.author)}</span>
      </li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${esc(url)}">

  <meta property="og:site_name" content="Daily Wisdom">
  <meta property="og:type" content="website">
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

  <!-- Humans go to the interactive archive; crawlers keep the list below. -->
  <script>location.replace(${JSON.stringify(appUrl)});</script>
  <style>
    body{font-family:Georgia,serif;background:#F7F4ED;color:#29261F;margin:0;padding:48px 24px;
      max-width:760px;margin-inline:auto;line-height:1.5}
    h1{font-size:30px;font-weight:500;margin:0 0 6px}
    p.lede{color:#6B6357;margin:0 0 28px}
    ul{list-style:none;padding:0;margin:0}
    li{margin:0 0 20px}
    a{color:#29261F;text-decoration:none}
    a:hover{color:#A98B4F}
    span{display:block;color:#6B6357;font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin-top:5px}
    .back{display:inline-block;margin-top:30px;color:#A98B4F}
    @media (prefers-color-scheme:dark){
      body{background:#191713;color:#EAE4D6}a{color:#EAE4D6}p.lede,span{color:#97907F}
    }
  </style>
</head>
<body>
  <h1>${esc(cap(theme))}</h1>
  <p class="lede">${esc(desc)}</p>
  <ul>
${items}
  </ul>
  <a class="back" href="${esc(appUrl)}">Browse Daily Wisdom →</a>
</body>
</html>
`;
}

async function main() {
  const raw = await readFile(path.join(ROOT, "data", "quotes.json"), "utf8");
  const quotes = JSON.parse(raw).slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  const byTag = new Map();
  for (const q of quotes) {
    for (const t of q.tags || []) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(q);
    }
  }

  const outDir = path.join(ROOT, "t");
  const imgDir = path.join(outDir, "img");
  await mkdir(imgDir, { recursive: true });

  for (const [theme, list] of byTag) {
    await writeFile(path.join(outDir, `${theme}.html`), page(theme, list), "utf8");
    const svg = await satori(card(theme, list.length), { width: 1200, height: 630, fonts });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
    await writeFile(path.join(imgDir, `${theme}.png`), png);
  }

  console.log(`build-tags: wrote ${byTag.size} theme page(s) and card(s) to /t`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
