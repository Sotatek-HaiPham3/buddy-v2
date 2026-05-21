import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Button } from './ui/button.js';

export function PdfPreview({
  open,
  onClose,
  topic,
  docId,
  initialPage,
}: {
  open: boolean;
  onClose: () => void;
  topic: string;
  docId: string;
  initialPage: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => setPage(initialPage), [initialPage]);
  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [page, docId, topic, retryTick]);
  if (!open) return null;
  const imgSrc = `${api.pdfPageUrl(topic, docId, page)}&r=${retryTick}`;
  return (
    <div className="fixed inset-0 z-20 bg-black/40 p-8">
      <div className="mx-auto flex h-full max-w-4xl flex-col rounded bg-white">
        <div className="flex items-center justify-between border-b p-2">
          <div className="text-sm">{docId}</div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex items-center gap-2 border-b p-2">
          <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <span className="text-sm">Page {page}</span>
          <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {loading ? <div className="p-2 text-sm text-slate-500">Loading preview...</div> : null}
          {error ? (
            <div className="space-y-2 p-2 text-sm text-red-600">
              <div>{error}</div>
              <Button variant="ghost" onClick={() => setRetryTick((n) => n + 1)}>
                Retry
              </Button>
            </div>
          ) : null}
          <img
            src={imgSrc}
            alt={`Preview page ${page}`}
            className={`mx-auto ${error ? 'hidden' : ''}`}
            onLoad={() => {
              setLoading(false);
              setError(null);
            }}
            onError={() => {
              setLoading(false);
              setError(`Could not load PDF preview for page ${page}.`);
            }}
          />
        </div>
      </div>
    </div>
  );
}
