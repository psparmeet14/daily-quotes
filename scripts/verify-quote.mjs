/*
 * verify-quote.mjs — is this quote really in this text, word for word?
 *
 * The weekly batch must match every quote against a text it fetched. This
 * does the matching the same way every time, tolerating only what differs
 * between a scan and a quotation: case, punctuation, curly vs straight
 * quotes, line breaks, words hyphenated across lines, and the "¬" soft
 * hyphen archive.org OCR leaves at page breaks. Wording must be identical.
 * HTML tags are stripped only from .html files — OCR text is full of stray
 * "<" characters, and stripping "tags" from it deletes whole pages.
 *
 * Usage: node scripts/verify-quote.mjs <text-file> "<quote>"
 * Exits 0 and prints the surrounding passage when found; exits 1 with the
 * longest matching opening otherwise.
 */
import { readFile } from "node:fs/promises";

const [file, quote] = process.argv.slice(2);
if (!file || !quote) {
  console.error('usage: node scripts/verify-quote.mjs <text-file> "<quote>"');
  process.exit(2);
}

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function norm(s, isHtml) {
  if (isHtml) {
    s = s.replace(/<[^>]+>/g, " ")
      .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : entities[e] ?? " ")
      .replace(/\bp\d{2,3}\b/g, " "); // Loeb page markers (LacusCurtius)
  }
  return s
    .replace(/¬\s*/g, "")
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
    .replace(/(\w)-\s+(\w)/g, "$1$2")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const raw = await readFile(file, "utf8");
const text = norm(raw, /\.html?$/i.test(file));
const q = norm(quote, false);

const at = text.indexOf(q);
if (at >= 0) {
  console.log(`FOUND in ${file}\n…${text.slice(Math.max(0, at - 160), at + q.length + 160)}…`);
  process.exit(0);
}
const words = q.split(" ");
let n = words.length - 1;
while (n > 2 && !text.includes(words.slice(0, n).join(" "))) n--;
console.log(`NOT FOUND in ${file}\nThe first ${n > 2 ? n : 0} of ${words.length} words match; it diverges at: "${words.slice(n, n + 6).join(" ")}"`);
process.exit(1);
