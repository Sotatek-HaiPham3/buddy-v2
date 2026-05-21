import { useState } from 'react';
import type { ReasoningTrace } from '../api/types.js';

export function ReasoningPanel({ trace }: { trace: ReasoningTrace | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!trace) return null;
  return (
    <div className="mt-2 rounded border bg-slate-50">
      <button type="button" className="w-full px-2 py-1 text-left text-xs" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open ? (
        <pre className="overflow-auto whitespace-pre-wrap border-t px-2 py-2 text-xs">{JSON.stringify(trace, null, 2)}</pre>
      ) : null}
    </div>
  );
}
