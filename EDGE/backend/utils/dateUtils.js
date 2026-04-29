function toISODate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toISOString().slice(0, 10);
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
};
