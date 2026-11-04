'use strict';
/**
 * Suggested public holidays for India, offered in the app's Holidays screen. The admin picks which
 * to add — nothing is applied automatically.
 *
 *  • national: the three national holidays, fixed dates, every year.
 *  • festival: common gazetted festival holidays. Lunar / moon-sighting festivals move every year
 *    and can differ by a day between states, so each year's dates live in FESTIVALS below and are
 *    shown with "verify" — UPDATE THIS TABLE each year from the central government (DoPT) list.
 */
const NATIONAL = [
  { md: '01-26', name: 'Republic Day' },
  { md: '08-15', name: 'Independence Day' },
  { md: '10-02', name: 'Gandhi Jayanti' },
];

// year → [date, name]. Dates as published for central government offices; states may differ.
const FESTIVALS = {
  2026: [
    ['2026-03-04', 'Holi'],
    ['2026-03-21', 'Id-ul-Fitr'],
    ['2026-03-26', 'Ram Navami'],
    ['2026-03-31', 'Mahavir Jayanti'],
    ['2026-04-03', 'Good Friday'],
    ['2026-05-01', 'Buddha Purnima'],
    ['2026-05-27', 'Id-ul-Zuha (Bakrid)'],
    ['2026-06-26', 'Muharram'],
    ['2026-08-26', 'Milad-un-Nabi'],
    ['2026-09-04', 'Janmashtami'],
    ['2026-10-20', 'Dussehra'],
    ['2026-11-08', 'Diwali (Deepavali)'],
    ['2026-11-24', "Guru Nanak's Birthday"],
    ['2026-12-25', 'Christmas'],
  ],
};

function suggestionsFor(year) {
  const y = Number(year);
  const list = NATIONAL.map((h) => ({ date: `${y}-${h.md}`, name: h.name, type: 'national', verify: false }));
  for (const [date, name] of FESTIVALS[y] || []) list.push({ date, name, type: 'festival', verify: true });
  // Christmas is a fixed date even in years not in the table.
  if (!FESTIVALS[y]) list.push({ date: `${y}-12-25`, name: 'Christmas', type: 'festival', verify: false });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { suggestionsFor, FESTIVAL_YEARS: Object.keys(FESTIVALS).map(Number) };
