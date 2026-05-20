# Database Schema Changes

## New Table: `AgentTable`

Stores extracted tables separately from document content.

```sql
CREATE TABLE "AgentTable" (
  -- Identity
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" uuid NOT NULL REFERENCES "AgentDocument"("id") ON DELETE CASCADE,
  "tableId" varchar(50) NOT NULL UNIQUE,  -- "tbl_abc123"

  -- Source Information
  "sourceType" varchar(20) NOT NULL,      -- "extracted" | "sheet"
  "sourcePage" integer,                    -- Page number if from PDF/DOCX
  "sourceSheet" varchar(255),              -- Sheet name if from Excel
  "sourceRange" varchar(50),               -- Cell range (e.g., "A1:F50")

  -- Metadata
  "title" text,                            -- Table title/name
  "description" text,                      -- LLM-generated description
  "columnHeaders" jsonb NOT NULL,          -- ["Col1", "Col2", ...]
  "columnTypes" jsonb NOT NULL,            -- ["string", "number", ...]
  "rowCount" integer NOT NULL,
  "columnCount" integer NOT NULL,

  -- Data
  "sampleRows" jsonb NOT NULL,             -- First 3-5 rows for preview
  "data" jsonb NOT NULL,                   -- Full table data

  -- Processing Status
  "status" varchar(20) DEFAULT 'pending',  -- pending | processing | completed | failed
  "error" text,                            -- Error message if failed

  -- Timestamps
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_table_document ON "AgentTable"("documentId");
CREATE UNIQUE INDEX idx_agent_table_id ON "AgentTable"("tableId");
CREATE INDEX idx_agent_table_status ON "AgentTable"("status");
```

## Drizzle Schema

```typescript
// lib/db/schema.ts

export const agentTable = pgTable("AgentTable", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("documentId")
    .notNull()
    .references(() => agentDocument.id, { onDelete: "cascade" }),
  tableId: varchar("tableId", { length: 50 }).notNull().unique(),

  // Source
  sourceType: varchar("sourceType", { length: 20 }).notNull(),
  sourcePage: integer("sourcePage"),
  sourceSheet: varchar("sourceSheet", { length: 255 }),
  sourceRange: varchar("sourceRange", { length: 50 }),

  // Metadata
  title: text("title"),
  description: text("description"),
  columnHeaders: jsonb("columnHeaders").notNull().$type<string[]>(),
  columnTypes: jsonb("columnTypes").notNull().$type<string[]>(),
  rowCount: integer("rowCount").notNull(),
  columnCount: integer("columnCount").notNull(),

  // Data
  sampleRows: jsonb("sampleRows").notNull().$type<any[][]>(),
  data: jsonb("data").notNull().$type<any[][]>(),

  // Status
  status: varchar("status", { length: 20 }).default("pending"),
  error: text("error"),

  // Timestamps
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// Relations
export const agentTableRelations = relations(agentTable, ({ one }) => ({
  document: one(agentDocument, {
    fields: [agentTable.documentId],
    references: [agentDocument.id],
  }),
}))

// Add reverse relation to agentDocument
export const agentDocumentRelations = relations(agentDocument, ({ many }) => ({
  tables: many(agentTable),
  // ... existing relations
}))
```

## Updated PageIndexTree Type

```typescript
// lib/pageindex/types.ts

export interface PageIndexTree {
  docName: string
  docDescription?: string
  structure: PageIndexNode[]
  totalPages: number
  metadata: {
    mode: ProcessingMode
    tocFound: boolean
    tocPages?: number[]
    processedAt: string
    model: string
  }

  // NEW: Table index
  tables?: string[]  // List of tableIds in this document
}

export interface PageIndexNode {
  nodeId: string
  title: string
  startPage: number
  endPage: number
  summary: string
  children: PageIndexNode[]

  // NEW: Table references
  tableRefs?: TableReference[]
}

export interface TableReference {
  tableId: string
  position: "inline" | "after" | "before"
  anchorText?: string  // Text near the table for context
}
```

## Type Definitions

```typescript
// lib/pageindex/types.ts or new file: lib/tables/types.ts

export type SourceType = "extracted" | "sheet"

export type ColumnType =
  | "string"
  | "number"
  | "date"
  | "currency"
  | "percentage"
  | "boolean"
  | "unknown"

export type TableStatus = "pending" | "processing" | "completed" | "failed"

export interface StoredTable {
  id: string
  documentId: string
  tableId: string

  // Source
  sourceType: SourceType
  sourcePage?: number
  sourceSheet?: string
  sourceRange?: string

  // Metadata
  title?: string
  description?: string
  columnHeaders: string[]
  columnTypes: ColumnType[]
  rowCount: number
  columnCount: number

  // Data
  sampleRows: any[][]
  data: any[][]

  // Status
  status: TableStatus
  error?: string

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// For API responses (excludes full data)
export interface TableMetadata {
  tableId: string
  title?: string
  description?: string
  columnHeaders: string[]
  columnTypes: ColumnType[]
  rowCount: number
  columnCount: number
  sampleRows: any[][]
  sourceType: SourceType
  sourcePage?: number
  sourceSheet?: string
}
```

## Query Functions

```typescript
// lib/db/queries.ts

export async function getTablesByDocument(
  documentId: string
): Promise<TableMetadata[]> {
  const tables = await db
    .select({
      tableId: agentTable.tableId,
      title: agentTable.title,
      description: agentTable.description,
      columnHeaders: agentTable.columnHeaders,
      columnTypes: agentTable.columnTypes,
      rowCount: agentTable.rowCount,
      columnCount: agentTable.columnCount,
      sampleRows: agentTable.sampleRows,
      sourceType: agentTable.sourceType,
      sourcePage: agentTable.sourcePage,
      sourceSheet: agentTable.sourceSheet,
    })
    .from(agentTable)
    .where(eq(agentTable.documentId, documentId))

  return tables
}

export async function getTableData(
  tableId: string
): Promise<StoredTable | null> {
  const [table] = await db
    .select()
    .from(agentTable)
    .where(eq(agentTable.tableId, tableId))
    .limit(1)

  return table ?? null
}

export async function createTable(
  data: Omit<StoredTable, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const [result] = await db
    .insert(agentTable)
    .values({
      ...data,
      id: crypto.randomUUID(),
    })
    .returning({ tableId: agentTable.tableId })

  return result.tableId
}

export async function deleteTablesByDocument(
  documentId: string
): Promise<void> {
  await db
    .delete(agentTable)
    .where(eq(agentTable.documentId, documentId))
}
```

## Migration

```sql
-- migrations/XXXX_add_agent_table.sql

CREATE TABLE IF NOT EXISTS "AgentTable" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" uuid NOT NULL REFERENCES "AgentDocument"("id") ON DELETE CASCADE,
  "tableId" varchar(50) NOT NULL UNIQUE,
  "sourceType" varchar(20) NOT NULL,
  "sourcePage" integer,
  "sourceSheet" varchar(255),
  "sourceRange" varchar(50),
  "title" text,
  "description" text,
  "columnHeaders" jsonb NOT NULL,
  "columnTypes" jsonb NOT NULL,
  "rowCount" integer NOT NULL,
  "columnCount" integer NOT NULL,
  "sampleRows" jsonb NOT NULL,
  "data" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending',
  "error" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_table_document ON "AgentTable"("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_table_id ON "AgentTable"("tableId");
CREATE INDEX IF NOT EXISTS idx_agent_table_status ON "AgentTable"("status");
```

## AgentDocument Updates

No schema changes needed for AgentDocument, but the processing flow changes:

```typescript
// After document processing:
interface AgentDocumentWithTables {
  // ... existing fields
  pageIndexTree: PageIndexTree  // Now includes tables[] array
  // Tables stored in separate AgentTable records
}
```

## Storage Considerations

### Large Tables

For tables with many rows (>10,000):

```sql
-- Option 1: Compress data column
ALTER TABLE "AgentTable"
ALTER COLUMN "data" SET STORAGE EXTENDED;

-- Option 2: Store large tables in blob storage
-- Add column for blob reference
ALTER TABLE "AgentTable"
ADD COLUMN "dataUrl" text;  -- URL to blob storage if data too large
```

### Data Size Limits

```typescript
const MAX_INLINE_ROWS = 10000
const MAX_INLINE_SIZE_MB = 10

async function storeTableData(
  tableId: string,
  data: any[][]
): Promise<{ storage: "inline" | "blob", url?: string }> {
  const dataSize = JSON.stringify(data).length / (1024 * 1024)

  if (data.length > MAX_INLINE_ROWS || dataSize > MAX_INLINE_SIZE_MB) {
    // Store in blob storage
    const url = await uploadToBlob(`tables/${tableId}.json`, JSON.stringify(data))
    return { storage: "blob", url }
  }

  return { storage: "inline" }
}
```
