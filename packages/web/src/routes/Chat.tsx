import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageList } from '../components/MessageList.js';
import { Composer } from '../components/Composer.js';
import { PdfPreview } from '../components/PdfPreview.js';
import { Sidebar } from '../components/Sidebar.js';
import { downloadBlob, toJson, toMarkdown } from '../lib/export.js';
import { useChatStream } from '../state/chat.js';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from '../state/conversations.js';
import { useMessages } from '../state/messages.js';
import { useDocs, useTopics } from '../state/topics.js';

export default function Chat() {
  const { topic = '' } = useParams();
  const navigate = useNavigate();
  const { data: topics = [] } = useTopics();
  const { data: docs = [] } = useDocs(topic);
  const { data: conversations = [] } = useConversations(topic);
  const create = useCreateConversation(topic);
  const rename = useRenameConversation(topic);
  const del = useDeleteConversation(topic);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  useEffect(() => setActiveConvId(null), [topic]);
  const { data: messages = [] } = useMessages(activeConvId);
  const { pending, send } = useChatStream({ conversationId: activeConvId ?? '' });
  const [preview, setPreview] = useState<{ docId: string; page: number } | null>(null);
  const [citationError, setCitationError] = useState<string | null>(null);

  const handleSend = async (q: string) => {
    let cid = activeConvId;
    if (!cid) {
      const out = await create.mutateAsync(undefined);
      cid = out.id;
      setActiveConvId(out.id);
    }
    if (cid) await send(q);
  };

  const exportConversation = (id: string, asJson: boolean) => {
    const conv = conversations.find((c) => c.id === id);
    const title = conv?.title ?? 'chat';
    if (asJson) downloadBlob(toJson(messages), `${title}.json`, 'application/json');
    else downloadBlob(toMarkdown(messages, title), `${title}.md`, 'text/markdown');
  };

  if (topics.length > 0 && !topics.find((t) => t.topic === topic)) {
    return (
      <p className="p-6">
        Unknown topic. <button onClick={() => navigate('/')}>Back</button>
      </p>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar
        topics={topics}
        activeTopic={topic}
        conversations={conversations}
        activeConvId={activeConvId}
        onNewConversation={async () => {
          const out = await create.mutateAsync(undefined);
          setActiveConvId(out.id);
        }}
        onSelectConversation={setActiveConvId}
        onRenameConversation={(id, title) => rename.mutate({ id, title })}
        onDeleteConversation={(id) => {
          del.mutate(id);
          if (id === activeConvId) setActiveConvId(null);
        }}
        onExportConversation={exportConversation}
      />
      <main className="flex flex-1 flex-col">
        {citationError ? (
          <div className="mx-3 mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {citationError}
          </div>
        ) : null}
        <MessageList
          messages={messages}
          pending={pending}
          onCitationClick={({ doc, page }) => {
            setCitationError(null);
            const hit = docs.find((d) => d.doc_name === doc);
            if (hit) {
              setPreview({ docId: hit.doc_id, page });
              return;
            }
            setCitationError(`Could not resolve citation source: ${doc}`);
          }}
        />
        <Composer onSubmit={handleSend} pending={!!pending && !pending.done} />
      </main>
      {preview ? (
        <PdfPreview
          open
          onClose={() => setPreview(null)}
          topic={topic}
          docId={preview.docId}
          initialPage={preview.page}
        />
      ) : null}
    </div>
  );
}
