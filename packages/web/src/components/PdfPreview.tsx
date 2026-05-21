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
  useEffect(() => setPage(initialPage), [initialPage]);
  if (!open) return null;
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
          <img src={api.pdfPageUrl(topic, docId, page)} alt={`Preview page ${page}`} className="mx-auto" />
        </div>
      </div>
    </div>
  );
}
