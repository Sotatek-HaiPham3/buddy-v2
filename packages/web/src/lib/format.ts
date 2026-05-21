const DAY = 24 * 60 * 60 * 1000;

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}

export function formatRange(range: [number, number]): string {
  return range[0] === range[1] ? `p.${range[0]}` : `p.${range[0]}-${range[1]}`;
}

export interface DateGroup<T> {
  label: 'Today' | 'Yesterday' | 'This week' | 'Older';
  items: T[];
}

export function groupByDate<T>(items: T[], getDate: (item: T) => number): DateGroup<T>[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - DAY;
  const startOfWeek = startOfToday - 6 * DAY;
  const buckets: Record<DateGroup<T>['label'], T[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Older: [],
  };
  for (const item of items) {
    const t = getDate(item);
    if (t >= startOfToday) buckets.Today.push(item);
    else if (t >= startOfYesterday) buckets.Yesterday.push(item);
    else if (t >= startOfWeek) buckets['This week'].push(item);
    else buckets.Older.push(item);
  }
  return (['Today', 'Yesterday', 'This week', 'Older'] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}
