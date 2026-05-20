# Document Table Extraction (PDF/DOCX)

## Overview

PDFs and DOCX files often contain embedded tables mixed with text. This pipeline:
1. Detects tables during OCR/extraction
2. Extracts tables as structured data
3. Replaces tables in text with placeholders
4. Processes through existing PageIndex pipeline
5. Resolves placeholders to table references

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────┐
│ PDF/DOCX FILE                                                 │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 1: OCR/Extraction with Table Detection                  │
│ - Extract text with page markers                             │
│ - Detect table regions (layout analysis)                     │
│ - Mark table boundaries in content                           │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Table Extraction                                     │
│ - Parse detected tables into structured data                 │
│ - Clean up OCR artifacts                                     │
│ - Infer column types                                         │
│ - Replace in text: [[TABLE:tbl_xxx]]                         │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Store Tables                                         │
│ - Generate tableId for each                                  │
│ - Store in AgentTable with page reference                    │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: Existing PageIndex Pipeline                          │
│ - TOC detection                                              │
│ - Tree building                                              │
│ - Node splitting                                             │
│ - Summary generation                                         │
│ (Table placeholders preserved)                               │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Table Reference Resolution                           │
│ - Scan nodes for [[TABLE:xxx]] markers                       │
│ - Convert to tableRefs array                                 │
│ - Update node summaries to mention tables                    │
└──────────────────────────────────────────────────────────────┘
```

## Step Details

### Step 1: OCR/Extraction with Table Detection

Most OCR engines (Google Vision, AWS Textract, Azure Form Recognizer) can detect tables.

```typescript
interface ExtractionResult {
  pages: PageContent[]
  tables: DetectedTable[]
}

interface PageContent {
  pageNum: number
  text: string
  layout: LayoutBlock[]
}

interface DetectedTable {
  pageNum: number
  boundingBox: BoundingBox
  rows: TableRow[]
  confidence: number
}

interface TableRow {
  cells: TableCell[]
}

interface TableCell {
  text: string
  rowSpan?: number
  colSpan?: number
  boundingBox: BoundingBox
}

async function extractWithTables(document: Buffer): Promise<ExtractionResult> {
  // Use OCR engine with table detection enabled
  const result = await ocrEngine.analyze(document, {
    features: ['TEXT', 'TABLES', 'LAYOUT']
  })

  return {
    pages: result.pages.map(p => ({
      pageNum: p.pageNumber,
      text: p.fullText,
      layout: p.blocks
    })),
    tables: result.tables.map(t => ({
      pageNum: t.pageNumber,
      boundingBox: t.boundingBox,
      rows: t.rows,
      confidence: t.confidence
    }))
  }
}
```

### Step 2: Table Extraction & Placeholder Injection

```typescript
interface ProcessedContent {
  content: string                    // Text with [[TABLE:xxx]] markers
  tables: Map<string, ExtractedTable>
}

interface ExtractedTable {
  tableId: string
  pageNum: number
  data: string[][]
  headers: string[]
  columnTypes: ColumnType[]
  boundingBox: BoundingBox
}

function processTablesInContent(
  extraction: ExtractionResult
): ProcessedContent {
  const tables = new Map<string, ExtractedTable>()
  let content = ''

  for (const page of extraction.pages) {
    let pageText = page.text

    // Find tables on this page
    const pageTables = extraction.tables.filter(t => t.pageNum === page.pageNum)

    // Sort tables by position (top to bottom)
    pageTables.sort((a, b) => a.boundingBox.top - b.boundingBox.top)

    for (const table of pageTables) {
      const tableId = generateTableId()

      // Extract structured data
      const data = table.rows.map(row =>
        row.cells.map(cell => cleanOcrArtifacts(cell.text))
      )

      // Detect headers and types
      const headers = detectHeaders(data)
      const columnTypes = inferColumnTypes(data, headers.hasHeader)

      tables.set(tableId, {
        tableId,
        pageNum: page.pageNum,
        data: headers.hasHeader ? data.slice(1) : data,
        headers: headers.headers,
        columnTypes,
        boundingBox: table.boundingBox
      })

      // Replace table content in text with placeholder
      const tableText = reconstructTableText(table)
      pageText = pageText.replace(
        tableText,
        `\n[[TABLE:${tableId}]]\n`
      )
    }

    content += `<page_${page.pageNum}>\n${pageText}\n</page_${page.pageNum}>\n`
  }

  return { content, tables }
}
```

### Table Text Reconstruction

OCR engines sometimes split table text oddly. We need to find the table's text in the page:

```typescript
function reconstructTableText(table: DetectedTable): string {
  // Option 1: Use bounding box to find text in that region
  // Option 2: Concatenate cell texts and look for that pattern
  // Option 3: Use layout blocks marked as "table"

  // Simple approach: concatenate cells with approximate formatting
  return table.rows
    .map(row => row.cells.map(c => c.text).join('\t'))
    .join('\n')
}
```

### OCR Artifact Cleanup

```typescript
function cleanOcrArtifacts(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[|│┃]/g, '')          // Remove table border characters
    .replace(/[-─━]+/g, '')         // Remove horizontal lines
    .replace(/^\s+|\s+$/g, '')      // Trim
}
```

### Step 3: Store Tables

```typescript
async function storeTables(
  documentId: string,
  tables: Map<string, ExtractedTable>
): Promise<void> {
  for (const [tableId, table] of tables) {
    // Generate metadata
    const description = await generateTableDescription(table)

    await db.insert(agentTable).values({
      id: generateUUID(),
      documentId,
      tableId,
      sourceType: "extracted",
      sourcePage: table.pageNum,
      title: await inferTableTitle(table),
      description,
      columnHeaders: table.headers,
      columnTypes: table.columnTypes,
      rowCount: table.data.length,
      columnCount: table.headers.length,
      sampleRows: table.data.slice(0, 5),
      data: table.data,
      status: "completed"
    })
  }
}
```

### Step 4: PageIndex Pipeline

The existing PageIndex pipeline processes the content with `[[TABLE:xxx]]` markers intact:

```
Content with markers:
<page_1>
Introduction to the report...
</page_1>
<page_2>
The following table shows Q3 results:
[[TABLE:tbl_001]]
As shown above, revenue increased...
</page_2>
```

The markers flow through:
- TOC detection (ignored, just text)
- Tree building (preserved in node content)
- Node splitting (kept together if possible)
- Summary generation (LLM sees placeholder)

### Step 5: Table Reference Resolution

After PageIndex generates the tree:

```typescript
function resolveTableReferences(
  tree: PageIndexTree,
  tables: Map<string, ExtractedTable>
): PageIndexTree {
  const tableIds: string[] = []

  function processNode(node: PageIndexNode): void {
    // This would require access to node content
    // In practice, we scan for [[TABLE:xxx]] patterns

    const tablePattern = /\[\[TABLE:(tbl_[a-z0-9]+)\]\]/g
    const nodeContent = getNodeContent(node)  // From page range
    const matches = [...nodeContent.matchAll(tablePattern)]

    if (matches.length > 0) {
      node.tableRefs = matches.map(match => {
        const tableId = match[1]
        tableIds.push(tableId)

        return {
          tableId,
          position: "inline" as const
        }
      })
    }

    // Process children
    for (const child of node.children) {
      processNode(child)
    }
  }

  for (const rootNode of tree.structure) {
    processNode(rootNode)
  }

  tree.tables = [...new Set(tableIds)]
  return tree
}
```

### Update Summaries with Table Info

```typescript
async function updateSummariesWithTables(
  tree: PageIndexTree
): Promise<PageIndexTree> {
  async function updateNode(node: PageIndexNode): Promise<void> {
    if (node.tableRefs?.length) {
      // Fetch table metadata
      const tableDescriptions = await Promise.all(
        node.tableRefs.map(async ref => {
          const table = await getTableMetadata(ref.tableId)
          return `Contains table "${table.title}": ${table.description}`
        })
      )

      // Append table info to summary
      node.summary = `${node.summary} ${tableDescriptions.join('. ')}`
    }

    for (const child of node.children) {
      await updateNode(child)
    }
  }

  for (const rootNode of tree.structure) {
    await updateNode(rootNode)
  }

  return tree
}
```

## Table Detection Challenges

### 1. Borderless Tables

Some tables have no visible borders:

```
Product    Price    Stock
Widget A   $10.00   100
Widget B   $15.00   50
```

**Solution:** Use column alignment detection. If text aligns consistently across rows, it's likely a table.

### 2. Nested Tables

Tables within tables:

```
┌──────────────────────────────┐
│ Region │ Q1 Sales            │
│        │ ┌────────┬────────┐ │
│        │ │ Online │ Retail │ │
│        │ ├────────┼────────┤ │
│ North  │ │ $100   │ $200   │ │
│        │ └────────┴────────┘ │
└────────┴─────────────────────┘
```

**Solution:** Flatten nested tables or extract as separate tables with relationships.

### 3. Multi-Page Tables

Table continues across pages:

```
Page 5:
| Product | Q1 | Q2 |
|---------|----|----|
| A       | 10 | 12 |
| B       | 15 | 18 |
(continued on next page)

Page 6:
| Product | Q1 | Q2 |
|---------|----|----|
| C       | 20 | 22 |
| D       | 25 | 28 |
```

**Solution:** Detect continuation patterns and merge into single table.

### 4. Tables with Complex Headers

Multi-row headers:

```
|         | 2023          | 2024          |
|         | Q1   | Q2     | Q1   | Q2     |
|---------|------|--------|------|--------|
| Revenue | 100  | 120    | 130  | 150    |
```

**Solution:** Parse multi-row headers into hierarchical column names: "2023/Q1", "2023/Q2", etc.

### 5. Tables Disguised as Lists

```
• Widget A: $10.00 (100 in stock)
• Widget B: $15.00 (50 in stock)
• Widget C: $20.00 (75 in stock)
```

**Solution:** Detect consistent structure in list items. If parseable to columns, treat as table.

## Content Markers in Output

For the agent to understand table context, the retrieval should show:

```
--- Page 5 ---
The following table summarizes our Q3 performance metrics:

[Table: "Q3 Performance Metrics" - 4 columns, 12 rows]
Columns: Metric, Q1, Q2, Q3
Use readTable("tbl_001", "your question") to query this data.

As the table shows, revenue increased by 15% compared to Q2.
```

This gives the agent context about the table's location and purpose without showing raw data.
