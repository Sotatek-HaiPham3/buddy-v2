import type { ConversationSummary, TopicSummary } from '../api/types.js';
import { useNavigate } from 'react-router-dom';
import { ConversationList } from './ConversationList.js';
import { Button } from './ui/button.js';

export function Sidebar({
  topics,
  activeTopic,
  conversations,
  activeConvId,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onExportConversation,
}: {
  topics: TopicSummary[];
  activeTopic: string;
  conversations: ConversationSummary[];
  activeConvId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onExportConversation: (id: string, asJson: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <aside className="flex h-full w-72 flex-col border-r bg-white">
      <div className="border-b p-3">
        <label className="block text-xs font-medium text-slate-600">Topic</label>
        <select
          value={activeTopic}
          onChange={(e) => navigate(`/t/${encodeURIComponent(e.target.value)}`)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {topics.map((t) => (
            <option key={t.topic} value={t.topic}>
              {t.topic} ({t.doc_count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-xs font-medium text-slate-600">Conversations</span>
        <Button variant="ghost" onClick={onNewConversation}>
          + New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ConversationList
          conversations={conversations}
          activeId={activeConvId}
          onSelect={onSelectConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
          onExport={onExportConversation}
        />
      </div>
    </aside>
  );
}
