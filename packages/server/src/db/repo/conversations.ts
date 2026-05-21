import { convId } from '@buddy/shared';
import type { Db } from '../client.js';

export interface ConversationRow {
  id: string;
  topic: string;
  title: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function conversationsRepo(db: Db) {
  return {
    create(input: { topic: string; title?: string }): ConversationRow {
      const now = Date.now();
      const row: ConversationRow = {
        id: convId(),
        topic: input.topic,
        title: input.title ?? 'New chat',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      db.prepare(
        'INSERT INTO conversations(id,topic,title,created_at,updated_at,deleted_at) VALUES(@id,@topic,@title,@created_at,@updated_at,@deleted_at)',
      ).run(row);
      return row;
    },
    listByTopic(topic: string): { id: string; title: string; updated_at: number }[] {
      return db
        .prepare(
          'SELECT id,title,updated_at FROM conversations WHERE topic=? AND deleted_at IS NULL ORDER BY updated_at DESC',
        )
        .all(topic) as { id: string; title: string; updated_at: number }[];
    },
    get(id: string): ConversationRow | null {
      return (
        (db.prepare('SELECT * FROM conversations WHERE id=? AND deleted_at IS NULL').get(id) as
          | ConversationRow
          | undefined) ?? null
      );
    },
    rename(id: string, title: string): void {
      db.prepare('UPDATE conversations SET title=?, updated_at=? WHERE id=?').run(title, Date.now(), id);
    },
    touch(id: string): void {
      db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(Date.now(), id);
    },
    softDelete(id: string): void {
      db.prepare('UPDATE conversations SET deleted_at=? WHERE id=?').run(Date.now(), id);
    },
  };
}
