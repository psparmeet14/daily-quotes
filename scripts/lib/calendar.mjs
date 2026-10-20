/*
 * calendar.mjs — shared date helpers for the queue scripts.
 *
 * Quote ids are YYYY-MM-DD dates, so all arithmetic here is on those strings,
 * done in UTC to keep daylight-saving out of it. "Today" is the owner's day
 * (Asia/Kolkata), matching filter-released.mjs and the midnight-IST release.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const QUOTES_FILE = path.join(ROOT, "data", "quotes.json");

// The site runs a 365-day cycle from its first quote (2026-07-11 → 2027-07-10).
export const CYCLE_DAYS = 365;

// Minimum gap before an author can be quoted again.
export const AUTHOR_GAP_DAYS = 21;

export function todayIST() {
  return process.env.RELEASE_TODAY ||
    new Date().toLocaleDateString("en-CA", { timeZone: process.env.RELEASE_TZ || "Asia/Kolkata" });
}

export function addDays(id, n) {
  const d = new Date(id + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

export async function readQuotes(file = QUOTES_FILE) {
  return JSON.parse(await readFile(file, "utf8"));
}

export function lastDate(quotes) {
  return quotes.map((q) => q.date).sort().at(-1);
}

export function cycleEnd(quotes) {
  const first = quotes.map((q) => q.date).sort()[0];
  return addDays(first, CYCLE_DAYS - 1);
}

// Most recent date each person was quoted.
export function lastUsedBy(quotes) {
  const m = new Map();
  for (const q of quotes) {
    if (!q.person) continue;
    if (!m.has(q.person) || m.get(q.person) < q.date) m.set(q.person, q.date);
  }
  return m;
}
