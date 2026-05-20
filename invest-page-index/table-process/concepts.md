# Core Concepts

## 1. Table Reference Model

Tables are **not embedded** in the tree. Instead, nodes contain **table references**:

```typescript
interface PageIndexNode {
  nodeId: string
  title: string
  startPage: number
  endPage: number
  summary: string
  children: PageIndexNode[]

  // NEW: Table references
  tableRefs?: TableReference[]
}

interface TableReference {
  tableId: string           // Unique ID: "tbl_abc123"
  position: "inline" | "after" | "before"  // Where in the node
  anchorText?: string       // Text near the table for context
}
```

## 2. Table Storage

Tables are stored separately from the tree:

```typescript
interface StoredTable {
  tableId: string
  documentId: string

  // Source info
  sourceType: "extracted" | "sheet"  // From document or spreadsheet file
  sourcePage?: number                 // Page number if from document
  sourceSheet?: string                // Sheet name if from Excel
  sourceRange?: string                // Cell range (e.g., "A1:F50")

  // Table metadata
  title?: string
  description?: string                // LLM-generated description
  columnHeaders: string[]
  rowCount: number
  columnCount: number

  // Schema inference
  columnTypes: ColumnType[]           // "string" | "number" | "date" | etc.

  // Sample data (for agent context)
  sampleRows: any[][]                 // First 3-5 rows for preview

  // Full data (for query execution)
  data: any[][]                       // Complete table data
}

type ColumnType =
  | "string"
  | "number"
  | "date"
  | "currency"
  | "percentage"
  | "boolean"
  | "unknown"
```

## 3. Two-Level Query Pattern

Agent **never sees raw table data**. Instead:

```
┌─────────────────────────────────────────────────────────────┐
│ Master Agent                                                 │
│                                                             │
│  1. Sees tree with table references                         │
│  2. Sees table metadata (columns, types, sample rows)       │
│  3. Calls readTable(tableId, expectation)                   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Table Query Sub-Agent                                        │
│                                                             │
│  1. Receives table data + expectation                       │
│  2. Generates query (SQL-like or code)                      │
│  3. Executes query against table                            │
│  4. Returns structured result + explanation                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why Two Levels?

1. **Token Efficiency** - Master agent never loads full table data
2. **Specialized Reasoning** - Sub-agent is optimized for data queries
3. **Accurate Results** - Code execution beats LLM reasoning over raw data
4. **Transparency** - Query is visible for debugging

## 4. What Master Agent Sees

The master agent sees table metadata, NOT raw data:

```
Document: Financial Report
├── Summary (pages 1-5)
│   Contains: Table "Key Metrics" (tbl_001)
│   - Columns: Month, Revenue, Costs, Profit
│   - Types: date, currency, currency, currency
│   - Rows: 24
│   - Sample: Jan 2023 | $1.2M | $0.8M | $0.4M
│             Feb 2023 | $1.1M | $0.7M | $0.4M
│             Mar 2023 | $1.3M | $0.9M | $0.4M
│
├── Regional Breakdown (pages 6-15)
│   Contains: Table "Sales by Region" (tbl_002)
│   - Columns: Region, Q1, Q2, Q3, Q4, Total
│   - Types: string, currency, currency, currency, currency, currency
│   - Rows: 12
│   - Sample: North | $5M | $6M | $5.5M | $7M | $23.5M
│             ...
```

This lets the agent **reason about which table to query** without loading all data into context.

## 5. Updated PageIndexTree Type

```typescript
interface PageIndexTree {
  docName: string
  docDescription?: string
  structure: PageIndexNode[]
  totalPages: number
  metadata: {
    mode: ProcessingMode
    tocFound: boolean
    processedAt: string
    model: string
  }

  // NEW: Table index
  tables: string[]  // List of tableIds in this document
}
```

## 6. Query Flow Example

**User:** "What was our highest revenue month in 2023?"

**Master Agent:**
1. Sees tree with "Financial Summary" node referencing `tbl_001`
2. Sees metadata: columns ["Month", "Revenue", "Costs", "Profit"]
3. Sees sample: [["Jan 2023", "$1.2M", "$0.8M", "$0.4M"], ...]
4. Calls: `readTable(tableId: "tbl_001", expectation: "Find the month with highest revenue in 2023")`

**Table Query Sub-Agent:**
1. Receives full table data
2. Generates: `SELECT Month, Revenue FROM table WHERE Year(Month) = 2023 ORDER BY Revenue DESC LIMIT 1`
3. Executes query
4. Returns: `{type: "row", data: {Month: "Nov 2023", Revenue: "$2.1M"}, explanation: "November 2023 had the highest revenue at $2.1M"}`

**Master Agent:**
5. Responds: "Based on the financial data, November 2023 had your highest revenue at $2.1M."
