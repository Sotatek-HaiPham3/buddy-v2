# CSV Processing Pipeline

## Overview

CSV files are the simplest case - the entire file is a single table.

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────┐
│ CSV FILE                                                      │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Parse CSV                                            │
│ - Detect delimiter (comma, semicolon, tab)                   │
│ - Detect encoding (UTF-8, Latin-1, etc.)                     │
│ - Handle quoted fields and escapes                           │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Header Detection                                     │
│ - Is first row a header? (LLM check if ambiguous)           │
│ - Generate column names if no header (Col1, Col2, etc.)     │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Type Inference                                       │
│ - Sample rows to infer column types                          │
│ - Detect: number, date, currency, percentage, string         │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: Generate Table Metadata                              │
│ - LLM: "Describe this table in 1-2 sentences"               │
│ - Extract key statistics                                     │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Store Table                                          │
│ - Generate tableId (tbl_xxx)                                 │
│ - Store full data + metadata in AgentTable                   │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 6: Generate Tree                                        │
│ - Single root node with table reference                      │
│ - Node summary = table description                           │
└──────────────────────────────────────────────────────────────┘
```

## Step Details

### Step 1: Parse CSV

```typescript
interface ParseOptions {
  delimiter?: string      // auto-detect if not provided
  encoding?: string       // auto-detect if not provided
  quoteChar?: string      // default: "
  escapeChar?: string     // default: \
  skipEmptyLines?: boolean
}

function parseCSV(content: string, options?: ParseOptions): string[][] {
  // 1. Detect delimiter by analyzing first few lines
  const delimiter = options?.delimiter ?? detectDelimiter(content)

  // 2. Parse into rows/columns
  const rows = parse(content, { delimiter, ... })

  // 3. Clean up - trim whitespace, handle nulls
  return rows.map(row => row.map(cell => cell?.trim() ?? ''))
}
```

**Delimiter Detection:**
- Count occurrences of `,` `;` `\t` `|` in first 5 lines
- Choose most consistent delimiter

### Step 2: Header Detection

```typescript
function detectHeader(rows: string[][]): {
  hasHeader: boolean
  headers: string[]
  dataStartRow: number
} {
  const firstRow = rows[0]
  const secondRow = rows[1]

  // Heuristics:
  // 1. First row all strings, second row has numbers → header
  // 2. First row values are unique and descriptive → header
  // 3. First row matches common header patterns → header

  const firstRowAllStrings = firstRow.every(isNonNumeric)
  const secondRowHasNumbers = secondRow?.some(isNumeric)
  const firstRowUnique = new Set(firstRow).size === firstRow.length

  if (firstRowAllStrings && secondRowHasNumbers && firstRowUnique) {
    return { hasHeader: true, headers: firstRow, dataStartRow: 1 }
  }

  // If uncertain, ask LLM
  if (uncertain) {
    const llmResult = await askLLM(`
      Is the first row a header or data?
      Row 1: ${firstRow.join(', ')}
      Row 2: ${secondRow.join(', ')}
    `)
    // ...
  }

  // Generate column names if no header
  return {
    hasHeader: false,
    headers: firstRow.map((_, i) => `Column${i + 1}`),
    dataStartRow: 0
  }
}
```

### Step 3: Type Inference

```typescript
type ColumnType = "string" | "number" | "date" | "currency" | "percentage" | "boolean"

function inferColumnTypes(rows: string[][], headers: string[]): ColumnType[] {
  return headers.map((_, colIndex) => {
    const sampleValues = rows.slice(0, 100).map(row => row[colIndex])
    return inferType(sampleValues)
  })
}

function inferType(values: string[]): ColumnType {
  const nonEmpty = values.filter(v => v !== '')

  // Check patterns in order of specificity
  if (nonEmpty.every(matchesCurrency))    return "currency"
  if (nonEmpty.every(matchesPercentage))  return "percentage"
  if (nonEmpty.every(matchesDate))        return "date"
  if (nonEmpty.every(matchesBoolean))     return "boolean"
  if (nonEmpty.every(matchesNumber))      return "number"

  return "string"
}

// Pattern examples:
// Currency: $1,234.56 | 1.234,56 € | USD 1000
// Percentage: 12.5% | 12.5 % | 0.125 (if header says "rate" or "%")
// Date: 2023-01-15 | 01/15/2023 | Jan 15, 2023
// Boolean: true/false | yes/no | 1/0 | Y/N
```

### Step 4: Generate Table Metadata

```typescript
async function generateMetadata(
  data: string[][],
  headers: string[],
  types: ColumnType[],
  fileName: string
): Promise<TableMetadata> {
  // Generate sample rows
  const sampleRows = data.slice(0, 5)

  // Ask LLM for description
  const description = await askLLM(`
    Describe this table in 1-2 sentences.
    File: ${fileName}
    Columns: ${headers.join(', ')}
    Types: ${types.join(', ')}
    Sample:
    ${formatSample(sampleRows, headers)}
  `)

  return {
    title: inferTitle(fileName),
    description,
    columnHeaders: headers,
    columnTypes: types,
    rowCount: data.length,
    columnCount: headers.length,
    sampleRows
  }
}
```

### Step 5: Store Table

```typescript
async function storeTable(
  documentId: string,
  data: string[][],
  metadata: TableMetadata
): Promise<string> {
  const tableId = generateTableId()  // "tbl_abc123"

  await db.insert(agentTable).values({
    id: generateUUID(),
    documentId,
    tableId,
    sourceType: "sheet",
    title: metadata.title,
    description: metadata.description,
    columnHeaders: metadata.columnHeaders,
    columnTypes: metadata.columnTypes,
    rowCount: metadata.rowCount,
    columnCount: metadata.columnCount,
    sampleRows: metadata.sampleRows,
    data: data,
    status: "completed"
  })

  return tableId
}
```

### Step 6: Generate Tree

```typescript
function generateTree(
  fileName: string,
  tableId: string,
  metadata: TableMetadata
): PageIndexTree {
  return {
    docName: fileName,
    docDescription: metadata.description,
    structure: [{
      nodeId: "0000",
      title: metadata.title,
      startPage: 1,
      endPage: 1,
      summary: metadata.description,
      tableRefs: [{
        tableId: tableId,
        position: "inline"
      }],
      children: []
    }],
    totalPages: 1,
    metadata: {
      mode: "single_table",
      tocFound: false,
      processedAt: new Date().toISOString(),
      model: "csv-processor"
    },
    tables: [tableId]
  }
}
```

## Output Example

**Input:** `sales_2023.csv`
```csv
Month,Region,Revenue,Units
Jan,North,125000,500
Jan,South,98000,420
Feb,North,132000,530
...
```

**Output Tree:**
```json
{
  "docName": "sales_2023.csv",
  "docDescription": "Sales data by month and region for 2023",
  "structure": [{
    "nodeId": "0000",
    "title": "Sales Data 2023",
    "startPage": 1,
    "endPage": 1,
    "summary": "Monthly sales data broken down by region, including revenue in dollars and units sold. Contains data for North and South regions across all months of 2023.",
    "tableRefs": [{
      "tableId": "tbl_sales_001",
      "position": "inline"
    }],
    "children": []
  }],
  "totalPages": 1,
  "tables": ["tbl_sales_001"]
}
```

**Stored Table:**
```json
{
  "tableId": "tbl_sales_001",
  "sourceType": "sheet",
  "title": "Sales Data 2023",
  "description": "Monthly sales by region with revenue and units",
  "columnHeaders": ["Month", "Region", "Revenue", "Units"],
  "columnTypes": ["string", "string", "currency", "number"],
  "rowCount": 24,
  "columnCount": 4,
  "sampleRows": [
    ["Jan", "North", "125000", "500"],
    ["Jan", "South", "98000", "420"],
    ["Feb", "North", "132000", "530"]
  ],
  "data": [/* all 24 rows */]
}
```
