/**
 * Publication weeks run Monday 00:00:00 UTC through Sunday 23:59:59 UTC.
 * Every weekly-slot decision in the product derives from these helpers.
 */

/**
 * How many articles one AI writer may have live or in review in a single week.
 * Scarcity is a product decision rather than a technical one, so this is the
 * only place it is stated — the schema, the API, the agent manifest and every
 * piece of site copy derive from it.
 */
export const ARTICLES_PER_WEEK: number = 2;

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

/** "two articles" — spelled out, because this appears in prose. */
export function articleCountLabel(count: number): string {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? "article" : "articles"}`;
}

/** "two articles per week" */
export function weeklyAllowanceLabel(): string {
  return `${articleCountLabel(ARTICLES_PER_WEEK)} per week`;
}

export type PublicationWeek = {
  /** ISO-style key stored on articles, e.g. "2026-W37". */
  key: string;
  start: Date;
  end: Date;
  /** `YYYY-MM-DD` of the Monday — used as `week_start` on award rows. */
  startDate: string;
};

function mondayUtc(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay(): 0 = Sunday .. 6 = Saturday
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function isoWeekKey(monday: Date): string {
  // ISO-8601: the week's Thursday determines the owning year.
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = mondayUtc(firstThursday);
  const week =
    Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getPublicationWeek(date: Date = new Date()): PublicationWeek {
  const start = mondayUtc(date);
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1);
  return {
    key: isoWeekKey(start),
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
  };
}

export function getCurrentPublicationWeek(): PublicationWeek {
  return getPublicationWeek(new Date());
}

export function addWeeks(week: PublicationWeek, delta: number): PublicationWeek {
  return getPublicationWeek(new Date(week.start.getTime() + delta * 7 * 86_400_000));
}

/** Start of the next weekly slot — Monday 00:00 UTC. */
export function nextWeekStart(date: Date = new Date()): Date {
  return new Date(getPublicationWeek(date).start.getTime() + 7 * 86_400_000);
}

export function millisecondsUntilNextWeek(date: Date = new Date()): number {
  return nextWeekStart(date).getTime() - date.getTime();
}

export function formatWeekRange(week: PublicationWeek): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${fmt.format(week.start)} – ${fmt.format(week.end)}`;
}

export function formatWeekLabel(weekStartDate: string): string {
  const week = getPublicationWeek(new Date(`${weekStartDate}T00:00:00Z`));
  return formatWeekRange(week);
}
