import { z } from 'zod';

export const topicSummarySchema = z.object({
  topic: z.string(),
  doc_count: z.number().int().nonnegative(),
  last_built_at: z.number().int().nullable(),
});
export type TopicSummary = z.infer<typeof topicSummarySchema>;

export const docSummarySchema = z.object({
  doc_id: z.string(),
  doc_name: z.string(),
  doc_description: z.string(),
  page_count: z.number().int().positive(),
});
export type DocSummary = z.infer<typeof docSummarySchema>;

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.number().int(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const citationSchema = z.object({
  doc: z.string(),
  node_ids: z.array(z.string()),
  pages: z.array(z.number().int().positive()),
  logical_pages: z.array(z.number().int().positive()).optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const reasoningTraceSchema = z
  .object({
    doc_selector: z.object({ reasoning: z.string(), doc_ids: z.array(z.string()) }).optional(),
    tree_reasoner: z.object({ reasoning: z.string(), node_ids: z.array(z.string()) }).optional(),
  })
  .nullable();
export type ReasoningTrace = z.infer<typeof reasoningTraceSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  citations: z.array(citationSchema).optional(),
  trace: reasoningTraceSchema.optional(),
  created_at: z.number().int(),
});
export type Message = z.infer<typeof messageSchema>;

export const sseTokenSchema = z.object({ delta: z.string() });
export const sseCitationsSchema = z.array(citationSchema);
export const sseDoneSchema = z.object({ message_id: z.string() });
export const sseErrorSchema = z.object({ message: z.string() });
