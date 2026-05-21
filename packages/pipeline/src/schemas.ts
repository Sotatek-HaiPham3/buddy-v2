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

const positiveIntSchema = z.number().int().positive();
const nullablePositiveIntSchema = positiveIntSchema.nullable();

const subgroupHeadingTitleOnlySchema = z.tuple([z.string()]);
const subgroupHeadingLegacySchema = z.tuple([z.string(), positiveIntSchema]);
const subgroupHeadingWithLogicalSchema = z.tuple([z.string(), nullablePositiveIntSchema, positiveIntSchema]);

const structuredHeading2TupleSchema = z.tuple([z.string(), z.string()]);
const structuredHeadingLegacySchema = z.tuple([z.string(), z.string(), positiveIntSchema]);
const structuredHeadingWithLogicalSchema = z.tuple([z.string(), z.string(), nullablePositiveIntSchema, positiveIntSchema]);

const noTocHeadingObjectSchema = z.object({
  structure: z.string(),
  title: z.string(),
  physical_index: z.string(),
  logical_page: nullablePositiveIntSchema.optional(),
});

const noTocHeadingLegacyTupleSchema = structuredHeadingLegacySchema;
const noTocHeadingWithLogicalTupleSchema = structuredHeadingWithLogicalSchema;

export const subgroupHeadingsResponseSchema = z.array(z.union([
  subgroupHeadingTitleOnlySchema,
  subgroupHeadingLegacySchema,
  subgroupHeadingWithLogicalSchema,
]));

export const noTocHeadingsResponseSchema = z.array(z.union([
  structuredHeading2TupleSchema,
  noTocHeadingObjectSchema,
  noTocHeadingLegacyTupleSchema,
  noTocHeadingWithLogicalTupleSchema,
]));

export const masterMergeResponseSchema = z.array(
  z.union([
    structuredHeading2TupleSchema,
    structuredHeadingLegacySchema,
    structuredHeadingWithLogicalSchema,
    z.object({ action: z.literal('retrieve'), pages: z.array(z.number().int().positive()), reason: z.string() }),
  ]),
);
