const DAY_MS = 24 * 60 * 60 * 1000;

function moscowParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function getDailyDigestWindow(now: Date) {
  const current = moscowParts(now);
  const dayEnd = new Date(`${current.dateKey}T00:00:00+03:00`);
  const dayStart = new Date(dayEnd.getTime() - DAY_MS);
  const reported = moscowParts(new Date(dayStart.getTime() + 12 * 60 * 60 * 1000));
  return {
    shouldSend: current.hour === 0 && current.minute <= 15,
    dayStart,
    dayEnd,
    reportDateKey: reported.dateKey,
  };
}
