import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ConversationSummary } from '../api/types.js';
import { cn } from '../lib/cn.js';
import { DropdownMenu } from './ui/dropdown-menu.js';
import { Input } from './ui/input.js';

export function ConversationItem({
  conv,
  active,
  onSelect,
  onRename,
  onDelete,
  onExport,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, asJson: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  return (
    <div className={cn('group flex items-center gap-2 rounded px-2 py-1.5', active ? 'bg-slate-200' : 'hover:bg-slate-100')}>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() && draft.trim() !== conv.title) onRename(conv.id, draft.trim());
            setEditing(false);
          }}
        />
      ) : (
        <button type="button" className="flex-1 truncate text-left text-sm" onClick={() => onSelect(conv.id)}>
          {conv.title}
        </button>
      )}
      <DropdownMenu
        trigger={<MoreHorizontal size={14} className="opacity-0 group-hover:opacity-100" />}
        items={[
          { label: 'Rename', onClick: () => setEditing(true) },
          { label: 'Export (.md)', onClick: () => onExport(conv.id, false) },
          { label: 'Export (.json)', onClick: () => onExport(conv.id, true) },
          { label: 'Delete', onClick: () => onDelete(conv.id), danger: true },
        ]}
      />
    </div>
  );
}
