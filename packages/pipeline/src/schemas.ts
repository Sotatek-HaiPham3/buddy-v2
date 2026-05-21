import { z } from 'zod';

export const rawPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
  tokenCount: z.number().int().nonnegative(),
});

export const flatTocEntrySchema = z.object({
  structure: z.string(),
  title: z.string(),
  page: z.number().int().positive().optional(),
  physical_index: z.number().int().positive().optional(),
  appear_start: z.enum(['yes', 'no']).optional(),
});

export const detectTocResponseSchema = z.object({
  thinking: z.string().optional(),
  toc_detected: z.enum(['yes', 'no']),
});

export const detectPageNumbersResponseSchema = z.object({
  thinking: z.string().optional(),
  page_index_given_in_toc: z.enum(['yes', 'no']),
});

export const tocTransformResponseSchema = z.object({
  table_of_contents: z.array(z.object({
    structure: z.string(),
    title: z.string(),
    page: z.number().int().positive(),
  })),
});

export const physicalMappingResponseSchema = z.array(z.object({
  structure: z.string(),
  title: z.string(),
  physical_index: z.string(),
}));

export const verifyMappingResponseSchema = z.object({
  results: z.array(z.object({ structure: z.string(), correct: z.enum(['yes', 'no']) })),
});

export const subgroupHeadingsResponseSchema = z.array(z.tuple([z.string(), z.number().int().positive()]));

export const masterMergeResponseSchema = z.array(
  z.union([
    z.tuple([z.string(), z.string(), z.number().int().positive()]),
    z.object({ action: z.literal('retrieve'), pages: z.array(z.number().int().positive()), reason: z.string() }),
  ]),
);
