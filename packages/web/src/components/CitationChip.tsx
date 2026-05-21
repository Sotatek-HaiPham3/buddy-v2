import { formatRange } from '../lib/format.js';

export function CitationChip({
  doc,
  pages,
  onClick,
}: {
  doc: string;
  pages: number[];
  onClick: (doc: string, page: number) => void;
}) {
  const range: [number, number] = [pages[0] ?? 1, pages[pages.length - 1] ?? pages[0] ?? 1];
  return (
    <button
      type="button"
      onClick={() => onClick(doc, range[0])}
      className="rounded bg-slate-200 px-2 py-0.5 text-xs hover:bg-slate-300"
    >
      {doc} {formatRange(range)}
    </button>
  );
}
