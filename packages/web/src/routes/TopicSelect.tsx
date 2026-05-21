import { Link } from 'react-router-dom';
import { useTopics } from '../state/topics.js';

export default function TopicSelect() {
  const { data: topics, isLoading, error } = useTopics();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Pick a topic</h1>
      <p className="mt-1 text-sm text-slate-600">Topics are folders under <code>data/</code> that have been indexed.</p>
      {isLoading ? <p className="mt-4 text-sm">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">Failed to load topics.</p> : null}
      {topics?.length === 0 ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
          No topics indexed yet. Run <code>pnpm build-index --all</code> after placing PDFs in <code>data/&lt;topic&gt;/</code>.
        </p>
      ) : null}
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {topics?.map((t) => (
          <li key={t.topic}>
            <Link to={`/t/${encodeURIComponent(t.topic)}`} className="block rounded-md border bg-white p-4 shadow-sm hover:bg-slate-50">
              <div className="font-medium">{t.topic}</div>
              <div className="text-xs text-slate-500">{t.doc_count} docs</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
