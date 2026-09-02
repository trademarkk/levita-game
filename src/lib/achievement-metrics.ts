const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export type CreditMetric = {
  status: string;
  awardedAt: number;
  usedAt: number | null;
  expiredAt: number | null;
  expiresAt: number | null;
};

export type RollMetric = {
  cellType: string;
  startPosition: number;
  finalPosition: number;
  createdAt: number;
};

export function maxEventsInSevenDays(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  let best = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right += 1) {
    while (sorted[right] - sorted[left] >= 7 * DAY_MS) left += 1;
    best = Math.max(best, right - left + 1);
  }
  return best;
}

function moscowDayOrdinal(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Math.floor(Date.UTC(value("year"), value("month") - 1, value("day")) / DAY_MS);
}

export function distinctMoscowSaleDays(times: number[]) {
  return new Set(times.map(moscowDayOrdinal)).size;
}

export function longestConsecutiveMoscowSaleDays(times: number[]) {
  const days = [...new Set(times.map(moscowDayOrdinal))].sort((a, b) => a - b);
  let best = days.length ? 1 : 0;
  let current = best;
  for (let index = 1; index < days.length; index += 1) {
    current = days[index] === days[index - 1] + 1 ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}

export function usedRollStreakWithoutExpiry(credits: CreditMetric[]) {
  const terminal = credits
    .filter((credit) => credit.status === "used" || credit.status === "expired")
    .sort((a, b) => (a.usedAt ?? a.expiredAt ?? a.awardedAt) - (b.usedAt ?? b.expiredAt ?? b.awardedAt));
  let current = 0;
  let best = 0;
  for (const credit of terminal) {
    if (credit.status === "expired") current = 0;
    else {
      current += 1;
      best = Math.max(best, current);
    }
  }
  return best;
}

export function hasJustInTimeRoll(credits: CreditMetric[]) {
  return credits.some((credit) => {
    if (credit.status !== "used" || credit.usedAt == null || credit.expiresAt == null) return false;
    const remaining = credit.expiresAt - credit.usedAt;
    return remaining >= 0 && remaining <= THREE_HOURS_MS;
  });
}

export function maxForwardDistanceInThreeRolls(rolls: RollMetric[]) {
  const sorted = [...rolls].sort((a, b) => a.createdAt - b.createdAt);
  let best = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const window = sorted.slice(Math.max(0, index - 2), index + 1);
    const distance = window.reduce(
      (sum, roll) => sum + Math.max(0, roll.finalPosition - roll.startPosition),
      0,
    );
    if (window.length === 3) best = Math.max(best, distance);
    else if (sorted.length < 3) best = Math.max(best, distance);
  }
  return best;
}
