function toISODate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toISOString().slice(0, 10);
}

// EdgeFolio is built for Indian SMEs (see u5 machine settings' own 330-minute
// local_utc_offset convention) — but `Date#toISOString()` always renders UTC,
// discarding whatever timezone the server or the submitting phone is actually
// in. Used bare, attendance "today" and check-in/out clock times silently
// read as UTC — wrong by 5.5 hours, and wrong by a full calendar day for
// anything between 00:00–05:29 IST. These give the actual IST wall-clock
// date/time for a given instant (or now), independent of the machine's own
// OS timezone.
const IST_OFFSET_MINUTES = 330; // UTC+5:30

function toIstParts(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * 60000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 19),
  };
}

function todayIST() {
  return toIstParts(new Date()).date;
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function daysBetweenInclusive(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const delta = end.getTime() - start.getTime();
  return Math.floor(delta / (1000 * 60 * 60 * 24)) + 1;
}

module.exports = {
  toISODate,
  nowTime,
  monthLabel,
  daysBetweenInclusive,
  toIstParts,
  todayIST,
};
