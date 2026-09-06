// Single place for the app's one full-timestamp format: dd/mm/yyyy hh:mm:ss,
// 24-hour, in the device's local time zone. Date-only and month-only displays
// (calendars, holiday lists, month pickers) intentionally keep their own more
// readable formats — this is only for places showing an actual logged moment
// (a request's createdAt, an announcement's postedAt, the live clock, etc).
export function formatDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
