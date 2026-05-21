import type { ConversationSummary } from '../api/types.js';
import { groupByDate } from '../lib/format.js';
import { ConversationItem } from './ConversationItem.js';

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onExport,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, asJson: boolean) => void;
}) {
  const groups = groupByDate(conversations, (c) => c.updated_at);
  if (groups.length === 0) return <p className="px-2 py-3 text-xs text-slate-500">No conversations yet.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-2 pb-1 text-xs uppercase tracking-wide text-slate-500">{g.label}</div>
          <div className="space-y-1">
            {g.items.map((c) => (
              <ConversationItem
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onExport={onExport}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
