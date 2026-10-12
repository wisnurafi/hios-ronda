/**
 * WIB (UTC+7, no DST) time helpers for the ronda voice-stats feature.
 *
 * All week buckets and "night" windows are computed in Asia/Jakarta time,
 * regardless of the host machine's timezone.
 */

const WIB_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86_400_000;
const NIGHT_END_HOUR = 5; // night window: 00:00 - 05:00 WIB

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Monday (00:00 WIB) of the week containing `ts`, as "YYYY-MM-DD". */
function weekStartOf(ts) {
  const wib = new Date(ts + WIB_OFFSET_MS);
  const day = wib.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - diffToMonday)
  );
  return monday.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of the Monday `weeksAgo` weeks before the week of `ts`. */
function weekStartWeeksAgo(ts, weeksAgo) {
  const cur = weekStartOf(ts); // YYYY-MM-DD (UTC date == WIB Monday date)
  const d = new Date(cur + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Minutes of [startMs, endMs] overlapping the nightly 00:00-05:00 WIB window.
 * Sessions spanning multiple days are handled day by day.
 */
function nightMinutesBetween(startMs, endMs) {
  if (endMs <= startMs) return 0;
  let totalMs = 0;
  // WIB-midnight of the day containing startMs, expressed in epoch ms.
  let dayStartWib =
    Math.floor((startMs + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS;
  let guard = 0;
  while (dayStartWib < endMs && guard < 40) {
    guard += 1;
    const overlapStart = Math.max(startMs, dayStartWib);
    const overlapEnd = Math.min(endMs, dayStartWib + NIGHT_END_HOUR * 3600 * 1000);
    if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart;
    dayStartWib += DAY_MS;
  }
  return Math.floor(totalMs / 60_000);
}

/** Whole minutes between two epoch-ms timestamps. */
function minutesBetween(startMs, endMs) {
  return Math.max(0, Math.floor((endMs - startMs) / 60_000));
}

/** "Oct 6" style label for a YYYY-MM-DD week-start date. */
function shortDate(yyyyMmDd) {
  const d = new Date(yyyyMmDd + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Oct 6 – Oct 12" label for a week starting on `weekStart` (YYYY-MM-DD). */
function weekLabel(weekStart) {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return `${shortDate(weekStart)} – ${shortDate(end)}`;
}

/** "2h 14m" / "45m" formatting for a minute count. */
function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** { day, hour, minute } of `ts` in WIB wall-clock time (day: 0 = Sunday). */
function wibParts(ts) {
  const wib = new Date(ts + WIB_OFFSET_MS);
  return { day: wib.getUTCDay(), hour: wib.getUTCHours(), minute: wib.getUTCMinutes() };
}

module.exports = {
  weekStartOf,
  weekStartWeeksAgo,
  nightMinutesBetween,
  minutesBetween,
  weekLabel,
  formatDuration,
  wibParts,
};
