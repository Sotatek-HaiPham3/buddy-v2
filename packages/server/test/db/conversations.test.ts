import { describe, expect, it } from 'vitest';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { openDb, runMigrations } from '../../src/db/client.js';

describe('conversationsRepo', () => {
  it('creates and lists', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const repo = conversationsRepo(db);
    const row = repo.create({ topic: 'tax' });
    const listed = repo.listByTopic('tax');
    expect(listed[0]?.id).toBe(row.id);
  });
});
