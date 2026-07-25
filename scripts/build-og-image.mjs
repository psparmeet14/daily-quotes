/*
 * build-og-image.mjs — render one per-quote social share card (PNG) per quote.
 *
 * Why: the /q/<date>.html pages (see build-og.mjs) advertise an og:image that
 * social crawlers show when a link is shared. A generic card is forgettable; a
 * card carrying the actual quote gets far more clicks — the site's primary
 * growth lever. This renders each quote as a 1200x630 PNG into q/img/<id>.png,
 * matching the site's editorial look (Newsreader serif, warm background, gold
 * accent). Text only, no photo, even when the quote has an image.
 *
 * Pipeline: satori turns a JSX-like tree into SVG (with real line-wrapping),
 * then resvg rasterizes it to PNG. Both are BUILD-time devDependencies; nothing
 * ships to visitors. Fonts are the committed Newsreader subset in ./fonts.
 *
 * Run after filter-released.mjs so unreleased quotes get no card. Output lives
 * under q/ (gitignored). Run: `node scripts/build-og-image.mjs`.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONTS = path.join(__dirname, "fonts");

const font = async (f) => await readFile(path.join(FONTS, f));
const fonts = [
  { name: "Newsreader", data: await font("nr-400-normal.woff"), weight: 400, style: "normal" },
  { name: "Newsreader", data: await font("nr-500-normal.woff"), weight: 500, style: "normal" },
  { name: "Newsreader", data: await font("nr-600-normal.woff"), weight: 600, style: "normal" },
  { name: "Newsreader", data: await font("nr-400-italic.woff"), weight: 400, style: "italic" },
];

const BG = "#F7F4ED", INK = "#29261F", GOLD = "#A98B4F", MUTE = "#6B6357";

// Auto-size the quote by length so short lines feel grand and long ones fit.
function quoteSize(len) {
  if (len <= 30) return 76;
  if (len <= 60) return 64;
  if (len <= 110) return 52;
  if (len <= 170) return 44;
  if (len <= 230) return 37;
  return 32;
}

// Card credit: the person, not the full citation. "Seneca, Of a Happy Life
// (trans. …)" -> "Seneca"; "Unknown (misattributed to …)" -> "Unknown". The
// full attribution still lives on the page and in the link's title.
function shortAuthor(a) {
  return String(a || "")
    .replace(/\s*\([^)]*\)\s*$/, "") // drop a trailing parenthetical
    .split(",")[0]                    // keep the name, drop the work/section
    .trim() || String(a || "");
}

function card(q, num) {
  const qs = quoteSize(q.quote.length);
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
          style: { display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: GOLD, fontWeight: 600 },
          children: [
            { type: "div", props: { style: { display: "flex" }, children: "Daily Wisdom" } },
            { type: "div", props: { style: { display: "flex", color: MUTE, fontWeight: 400 },
              children: `No. ${num}` } },
          ],
        }},
        { type: "div", props: {
          style: { display: "flex", flexDirection: "column", flexGrow: 1,
            justifyContent: "center", paddingTop: 24, paddingBottom: 24 },
          children: [
            { type: "div", props: {
              style: { display: "flex", fontSize: qs, lineHeight: 1.28, fontWeight: 500, letterSpacing: -0.3 },
              children: `“${q.quote}”`,
            }},
          ],
        }},
        { type: "div", props: {
          style: { display: "flex", flexDirection: "column" },
          children: [
            { type: "div", props: { style: { display: "flex", width: 64, height: 3, backgroundColor: GOLD, marginBottom: 20 } } },
            { type: "div", props: {
              style: { display: "flex", fontSize: 24, letterSpacing: 1.5, textTransform: "uppercase", color: MUTE, fontWeight: 500 },
              children: shortAuthor(q.author),
            }},
          ],
        }},
      ],
    },
  };
}

async function main() {
  const raw = await readFile(path.join(ROOT, "data", "quotes.json"), "utf8");
  const quotes = JSON.parse(raw).slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  const outDir = path.join(ROOT, "q", "img");
  await mkdir(outDir, { recursive: true });

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    const svg = await satori(card(q, i + 1), { width: 1200, height: 630, fonts });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
    await writeFile(path.join(outDir, `${q.id}.png`), png);
  }

  console.log(`build-og-image: wrote ${quotes.length} card(s) to q/img`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
