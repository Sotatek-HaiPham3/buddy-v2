import { z } from 'zod';

export const imageRefSchema = z.object({
  path: z.string(),
  caption: z.string().optional(),
  page: z.number().int().positive(),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const tableRefSchema = z.object({
  path: z.string(),
  page: z.number().int().positive(),
  schema: z.string().optional(),
});
export type TableRef = z.infer<typeof tableRefSchema>;

export interface TreeNode {
  title: string;
  start_index: number;
  end_index: number;
  node_id: string;
  summary?: string;
  doc_page_start?: number;
  doc_page_end?: number;
  nodes: TreeNode[];
  images: ImageRef[];
  tables: TableRef[];
}

const _treeNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      title: z.string(),
      start_index: z.number().int().positive(),
      end_index: z.number().int().positive(),
      node_id: z.string(),
      summary: z.string().optional(),
      doc_page_start: z.number().int().positive().optional(),
      doc_page_end: z.number().int().positive().optional(),
      nodes: z.array(_treeNodeSchema).default([]),
      images: z.array(imageRefSchema).default([]),
      tables: z.array(tableRefSchema).default([]),
    })
    .refine((n) => n.end_index >= n.start_index, {
      message: 'end_index must be >= start_index',
    }),
);

export const treeNodeSchema = _treeNodeSchema as z.ZodType<TreeNode>;

export const docOutputSchema = z.object({
  doc_id: z.string(),
  doc_name: z.string(),
  doc_description: z.string(),
  structure: z.array(treeNodeSchema),
});
export type DocOutput = z.infer<typeof docOutputSchema>;
