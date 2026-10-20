/*
 * queue-status.mjs — how many days of quotes are queued beyond today.
 *
 * Prints key=value lines (days, last, today, complete) for $GITHUB_OUTPUT,
 * so the daily queue-alert workflow can warn before the site runs out.
 * `days` is 0 when today's quote is the last one, negative once the site
 * has gone stale. `complete` is true once the 365-day cycle is filled.
 *
 * Usage: node scripts/queue-status.mjs
 */
import { cycleEnd, daysBetween, lastDate, readQuotes, todayIST } from "./lib/calendar.mjs";

const quotes = await readQuotes();
const today = todayIST();
const last = lastDate(quotes);
const end = cycleEnd(quotes);

console.log(`days=${daysBetween(today, last)}`);
console.log(`last=${last}`);
console.log(`today=${today}`);
console.log(`complete=${last >= end}`);
