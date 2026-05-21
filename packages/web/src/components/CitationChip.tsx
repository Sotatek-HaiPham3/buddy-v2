import { formatRange } from '../lib/format.js';

export function CitationChip({
  doc,
  pages,
  logicalPages,
  onClick,
}: {
  doc: string;
  pages: number[];
  logicalPages?: number[] | undefined;
  onClick: (doc: string, page: number) => void;
}) {
  const range: [number, number] = [pages[0] ?? 1, pages[pages.length - 1] ?? pages[0] ?? 1];
  const physicalLabel = formatRange(range);
  const logicalRange: [number, number] | null = logicalPages?.length
    ? [logicalPages[0] ?? 1, logicalPages[logicalPages.length - 1] ?? logicalPages[0] ?? 1]
    : null;
  const logicalLabel = logicalRange ? formatRange(logicalRange) : null;
  const label = logicalLabel && logicalLabel !== physicalLabel
    ? `${logicalLabel} (PDF ${physicalLabel})`
    : physicalLabel;
  return (
    <button
      type="button"
      onClick={() => onClick(doc, range[0])}
      className="rounded bg-slate-200 px-2 py-0.5 text-xs hover:bg-slate-300"
    >
      {doc} {label}
    </button>
  );
}
