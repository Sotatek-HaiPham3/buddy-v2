import { z } from 'zod';
import {
  conversationSummarySchema,
  docSummarySchema,
  messageSchema,
  topicSummarySchema,
  type ConversationSummary,
  type DocSummary,
  type TopicSummary,
} from './types.js';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(url: string, init: RequestInit | undefined, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new ApiError(res.status, (await res.text()) || res.statusText);
  }
  return schema.parse((await res.json()) as unknown);
}

export const api = {
  topics: (): Promise<TopicSummary[]> => req('/api/topics', undefined, z.array(topicSummarySchema)),
  docs: (topic: string): Promise<DocSummary[]> =>
    req(`/api/topics/${encodeURIComponent(topic)}/docs`, undefined, z.array(docSummarySchema)),
  conversations: (topic: string): Promise<ConversationSummary[]> =>
    req(
      `/api/conversations?topic=${encodeURIComponent(topic)}`,
      undefined,
      z.array(conversationSummarySchema),
    ),
  createConversation: (topic: string, title?: string): Promise<{ id: string }> =>
    req(
      '/api/conversations',
      { method: 'POST', body: JSON.stringify({ topic, ...(title ? { title } : {}) }) },
      z.object({ id: z.string() }),
    ),
  renameConversation: (id: string, title: string): Promise<{ ok: boolean }> =>
    req(
      `/api/conversations/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ title }) },
      z.object({ ok: z.boolean() }),
    ),
  deleteConversation: (id: string): Promise<{ ok: boolean }> =>
    req(
      `/api/conversations/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      z.object({ ok: z.boolean() }),
    ),
  messages: (conversationId: string) =>
    req(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      undefined,
      z.array(messageSchema),
    ),
  pdfPageUrl: (topic: string, docId: string, page: number, scale = 2): string =>
    `/api/pdf/${encodeURIComponent(topic)}/${encodeURIComponent(docId)}?page=${page}&scale=${scale}`,
};
