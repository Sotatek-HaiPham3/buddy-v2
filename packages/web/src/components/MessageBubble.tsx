import type { Citation, ReasoningTrace } from '../api/types.js';
import { CitationChip } from './CitationChip.js';
import { ReasoningPanel } from './ReasoningPanel.js';

export function MessageBubble({
  role,
  content,
  citations,
  trace,
  onCitationClick,
}: {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[] | undefined;
  trace?: ReasoningTrace | null | undefined;
  onCitationClick: (cite: { doc: string; page: number }) => void;
}) {
  const user = role === 'user';
  return (
    <div className={`max-w-3xl rounded-lg p-3 text-sm ${user ? 'ml-auto bg-blue-600 text-white' : 'bg-white'}`}>
      <div className="whitespace-pre-wrap">{content}</div>
      {!user && citations?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {citations.map((c, i) => (
            <CitationChip
              key={`${c.doc}-${i}`}
              doc={c.doc}
              pages={c.pages}
              logicalPages={c.logical_pages}
              onClick={(doc, page) => onCitationClick({ doc, page })}
            />
          ))}
        </div>
      ) : null}
      {!user ? <ReasoningPanel trace={trace} /> : null}
    </div>
  );
}
