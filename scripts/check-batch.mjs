/*
 * check-batch.mjs — CI gate for a queued batch, and its review summary.
 *
 * A batch branch may change data/quotes.json in exactly one way: new quotes
 * appended on consecutive days after the base branch's last date, each with
 * a source link to the text it was checked against, a person and two
 * themes. Existing entries must be untouched — a batch that quietly edits
 * old quotes would sail through review. Prints the new quotes as markdown,
 * which becomes the pull request description the owner reviews on a phone.
 *
 * Usage: node scripts/check-batch.mjs [base-ref=origin/main]
 * Exits 1 on any rule broken (problems are printed above the summary).
 */
import { execFileSync } from "node:child_process";
import { addDays, readQuotes } from "./lib/calendar.mjs";

const base = process.argv[2] || "origin/main";
const before = JSON.parse(execFileSync("git", ["show", `${base}:data/quotes.json`], { encoding: "utf8", maxBuffer: 1 << 26 }));
const after = await readQuotes();

const problems = [];
const was = new Map(before.map((q) => [q.id, q]));
const now = new Map(after.map((q) => [q.id, q]));
for (const [id, q] of was) {
  if (!now.has(id)) problems.push(`${id} was removed`);
  else if (JSON.stringify(now.get(id)) !== JSON.stringify(q)) problems.push(`${id} was changed — a batch may only add quotes`);
}

const added = after.filter((q) => !was.has(q.id)).sort((a, b) => (a.date < b.date ? -1 : 1));
let expect = addDays(before.map((q) => q.date).sort().at(-1), 1);
for (const q of added) {
  if (q.id !== q.date) problems.push(`${q.id}: id and date differ`);
  if (q.date !== expect) problems.push(`${q.date}: expected ${expect} (dates must continue the queue with no gaps)`);
  if (!/^https?:\/\//.test(q.source || "")) problems.push(`${q.date}: no source link`);
  if (!("person" in q)) problems.push(`${q.date}: no person`);
  if (!Array.isArray(q.tags) || q.tags.length !== 2) problems.push(`${q.date}: needs two themes`);
  expect = addDays(q.date, 1);
}
if (!added.length) problems.push("no new quotes in this branch");

const day = (id) => new Date(id + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const lines = [];
if (problems.length) {
  lines.push("### ⚠️ Batch check failed", "", ...problems.map((p) => `- ${p}`), "");
}
if (added.length) {
  lines.push(`### ${added.length} quote(s) for ${day(added[0].date)} → ${day(added.at(-1).date)}`, "");
  added.forEach((q, i) => {
    lines.push(
      `#### ${i + 1}. ${day(q.date)} — ${q.person || "Unknown origin"}`,
      "",
      `> ${q.quote}`,
      "",
      `**Citation:** ${q.author}  `,
      `**Source:** ${q.source ? `[${q.source.replace(/^https?:\/\//, "").slice(0, 60)}](${q.source})` : "—"}  `,
      `**Themes:** ${(q.tags || []).join(", ")}`,
      "",
      q.description || "",
      "",
    );
  });
  lines.push(
    "---",
    "**To publish:** tap **Merge**. Each quote then goes live on its own day at midnight IST.  ",
    "**To change or drop one:** comment here and ask Claude in the DailyWisdom365 session to apply it, or close this PR and the next weekly run will prepare a fresh batch for these dates.",
  );
}
console.log(lines.join("\n"));
process.exit(problems.length ? 1 : 0);
