import { describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client.js';
import { messagesRepo } from '../../src/db/repo/messages.js';

describe('messagesRepo', () => {
  it('stores and lists', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const repo = messagesRepo(db);
    repo.create({ conversation_id: 'c1', role: 'user', content: 'hello' });
    const list = repo.listByConversation('c1');
    expect(list).toHaveLength(1);
  });
});
