// Pure period-boundary computation — ported from the Attendance Tracker's
// period_logic.py. No DB access; fully deterministic given a config list
// and target date(s). All dates are UTC calendar dates (midnight UTC).

function utcDate(year, month, day) {
  // month is 1-indexed here (matches the source's date(year, month, day) calls)
  return new Date(Date.UTC(year, month - 1, day));
}

function addMonthsUTC(d, months) {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1 + months, d.getUTCDate());
}

function addDaysUTC(d, days) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** "The most recent date with day == startDay that is <= targetDate." */
function periodStartOnOrBefore(targetDate, startDay) {
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  if (targetDate.getUTCDate() >= startDay) {
    return utcDate(year, month, startDay);
  }
  // previous month (handles year rollover automatically via addMonthsUTC)
  const prev = addMonthsUTC(utcDate(year, month, 1), -1);
  return utcDate(prev.getUTCFullYear(), prev.getUTCMonth() + 1, startDay);
}

/** periodEnd for a given periodStart + config shape. */
function periodEndForStart(periodStart, startDay, endDay) {
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth() + 1;
  if (endDay >= startDay) {
    return utcDate(year, month, endDay);
  }
  // following month (handles year rollover)
  const next = addMonthsUTC(utcDate(year, month, 1), 1);
  return utcDate(next.getUTCFullYear(), next.getUTCMonth() + 1, endDay);
}

/** Pick the config with the latest effectiveFrom <= targetDate; fall back
 * to the overall earliest-effectiveFrom config if none qualify. `configs`
 * must already be sorted ascending by effectiveFrom. */
function selectConfigForDate(configs, targetDate) {
  let selected = null;
  for (const config of configs) {
    if (config.effectiveFrom.getTime() <= targetDate.getTime()) {
      selected = config;
    }
  }
  return selected || configs[0];
}

/** Generates all consecutive period boundaries covering [dateFrom, dateTo].
 * Returns [{ periodStart, periodEnd, config }]. `configs` must be sorted
 * ascending by effectiveFrom. Throws if no configs are supplied. */
function generatePeriods(configs, dateFrom, dateTo) {
  if (!configs.length) {
    const err = new Error('No AttendancePeriodConfig exists yet — configure one before generating periods.');
    err.statusCode = 422;
    err.code = 'no_period_config';
    throw err;
  }

  const initialConfig = selectConfigForDate(configs, dateFrom);
  let periodStart = periodStartOnOrBefore(dateFrom, initialConfig.periodStartDay);

  const boundaries = [];
  const seen = new Set();
  while (periodStart.getTime() <= dateTo.getTime()) {
    const key = periodStart.toISOString();
    if (seen.has(key)) {
      throw new Error(`Period generation loop detected at ${key} — check config data.`);
    }
    seen.add(key);

    const config = selectConfigForDate(configs, periodStart);
    const periodEnd = periodEndForStart(periodStart, config.periodStartDay, config.periodEndDay);
    boundaries.push({ periodStart, periodEnd, config });
    periodStart = addDaysUTC(periodEnd, 1);
  }
  return boundaries;
}

module.exports = { utcDate, addMonthsUTC, addDaysUTC, periodStartOnOrBefore, periodEndForStart, selectConfigForDate, generatePeriods };
