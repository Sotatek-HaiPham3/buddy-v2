import { describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { messagesRepo } from '../../src/db/repo/messages.js';

describe('messagesRepo', () => {
  it('stores and lists', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const conversations = conversationsRepo(db);
    const repo = messagesRepo(db);
    const conversation = conversations.create({ topic: 't1', title: 'Conversation' });
    repo.create({ conversation_id: conversation.id, role: 'user', content: 'hello' });
    const list = repo.listByConversation(conversation.id);
    expect(list).toHaveLength(1);
  });
});
