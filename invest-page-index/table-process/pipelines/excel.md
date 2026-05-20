# Excel (XLS/XLSX) Processing Pipeline

## Overview

Excel files are complex - they can contain:
- Multiple sheets
- Multiple tables per sheet
- Text blocks (titles, notes, footnotes)
- Mixed content (tables + text in same sheet)
- Formatting (merged cells, colors, fonts)

This pipeline handles all these cases.

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────┐
│ EXCEL FILE                                                    │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Parse Excel                                          │
│ - Extract all sheets                                         │
│ - Preserve formatting metadata                               │
│ - Extract formulas as values                                 │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Per-Sheet Zone Detection                             │
│ - Find contiguous data regions                               │
│ - Identify empty rows/cols as boundaries                     │
│ - Detect merged cell regions                                 │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Zone Classification                                  │
│ For each detected region:                                    │
│ - TABLE: Consistent columns, data patterns                   │
│ - TEXT: Long text, sentences, paragraphs                     │
│ - HEADER: Short text, large/bold, precedes table             │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 4: Process Each Zone                                    │
│ - TABLE: Extract → Store in AgentTable                       │
│ - TEXT: Extract → Will become tree node content              │
│ - HEADER: Associate with following zone                      │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Build Tree Structure                                 │
│ - Each sheet = top-level node                                │
│ - Text zones = content nodes                                 │
│ - Table zones = table references                             │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 6: Generate Summaries                                   │
│ - Per-node summaries                                         │
│ - Sheet-level summaries                                      │
└──────────────────────────────────────────────────────────────┘
```

## Step Details

### Step 1: Parse Excel

```typescript
interface ParsedSheet {
  name: string
  cells: CellData[][]
  mergedRegions: MergedRegion[]
  rowHeights: number[]
  colWidths: number[]
}

interface CellData {
  value: string | number | null
  formula?: string
  format?: CellFormat
  position: { row: number, col: number }
}

interface CellFormat {
  bold?: boolean
  fontSize?: number
  fontColor?: string
  backgroundColor?: string
  alignment?: string
}

async function parseExcel(fileBuffer: Buffer): Promise<ParsedSheet[]> {
  // Use library like xlsx or exceljs
  const workbook = XLSX.read(fileBuffer)

  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    return {
      name,
      cells: extractCells(sheet),
      mergedRegions: extractMergedRegions(sheet),
      // ...
    }
  })
}
```

### Step 2: Zone Detection

```typescript
interface DataRegion {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  cellCount: number
}

function findDataRegions(sheet: ParsedSheet): DataRegion[] {
  const regions: DataRegion[] = []
  const visited = new Set<string>()

  for (let row = 0; row < sheet.cells.length; row++) {
    for (let col = 0; col < sheet.cells[row]?.length; col++) {
      const key = `${row},${col}`
      if (visited.has(key)) continue

      const cell = sheet.cells[row]?.[col]
      if (!cell || cell.value === null) continue

      // Flood-fill to find connected region
      const region = expandRegion(sheet, row, col, visited)
      if (region.cellCount > 1) {
        regions.push(region)
      }
    }
  }

  return regions
}

function expandRegion(
  sheet: ParsedSheet,
  startRow: number,
  startCol: number,
  visited: Set<string>
): DataRegion {
  // Find boundaries by scanning for empty rows/cols
  let endRow = startRow
  let endCol = startCol

  // Scan right until empty column
  while (endCol < maxCol && hasDataInColumn(sheet, startRow, endRow, endCol + 1)) {
    endCol++
  }

  // Scan down until empty row
  while (endRow < maxRow && hasDataInRow(sheet, endRow + 1, startCol, endCol)) {
    endRow++
  }

  // Mark all cells as visited
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      visited.add(`${r},${c}`)
    }
  }

  return {
    startRow, endRow, startCol, endCol,
    cellCount: (endRow - startRow + 1) * (endCol - startCol + 1)
  }
}
```

### Step 3: Zone Classification

```typescript
type ZoneType = "table" | "text" | "header" | "unknown"

interface ClassifiedZone {
  region: DataRegion
  type: ZoneType
  confidence: number
}

async function classifyZones(
  sheet: ParsedSheet,
  regions: DataRegion[]
): Promise<ClassifiedZone[]> {
  return Promise.all(regions.map(async region => {
    const classification = analyzeRegion(sheet, region)

    // If uncertain, use LLM
    if (classification.confidence < 0.8) {
      const llmResult = await classifyWithLLM(sheet, region)
      return { ...llmResult, region }
    }

    return { ...classification, region }
  }))
}

function analyzeRegion(sheet: ParsedSheet, region: DataRegion): {
  type: ZoneType
  confidence: number
} {
  const cells = extractCellsInRegion(sheet, region)
  const rowCount = region.endRow - region.startRow + 1
  const colCount = region.endCol - region.startCol + 1

  // === TABLE indicators ===
  const hasConsistentColumns = checkColumnConsistency(cells)
  const hasNumericData = countNumericCells(cells) > 0.3 * cells.length
  const hasHeaderRow = detectHeaderRow(cells[0], cells[1])
  const hasFormulas = cells.some(row => row.some(c => c.formula))

  // === TEXT indicators ===
  const avgCellLength = cells.flat()
    .filter(c => typeof c.value === 'string')
    .reduce((sum, c) => sum + (c.value as string).length, 0) / cells.length
  const hasSentences = cells.flat().some(c =>
    typeof c.value === 'string' && /[.!?]/.test(c.value)
  )

  // === HEADER indicators ===
  const isSingleRow = rowCount === 1
  const hasLargeFont = cells.flat().some(c => (c.format?.fontSize ?? 11) > 14)
  const hasBold = cells.flat().some(c => c.format?.bold)
  const isMerged = sheet.mergedRegions.some(m =>
    overlaps(m, region) && m.colspan > 1
  )

  // Classification logic
  if (isSingleRow && (hasLargeFont || hasBold || isMerged)) {
    return { type: "header", confidence: 0.9 }
  }

  if (hasConsistentColumns && (hasNumericData || hasHeaderRow)) {
    return { type: "table", confidence: 0.85 }
  }

  if (hasSentences && avgCellLength > 50) {
    return { type: "text", confidence: 0.8 }
  }

  return { type: "unknown", confidence: 0.5 }
}
```

### Step 4: Process Zones

```typescript
interface ProcessedZone {
  zone: ClassifiedZone
  tableId?: string        // If table
  content?: string        // If text
  title?: string          // If header
  associatedWith?: string // Header → table/text ID
}

async function processZones(
  documentId: string,
  sheet: ParsedSheet,
  zones: ClassifiedZone[]
): Promise<ProcessedZone[]> {
  const processed: ProcessedZone[] = []

  for (const zone of zones) {
    if (zone.type === "table") {
      // Extract and store table
      const data = extractTableData(sheet, zone.region)
      const metadata = await generateTableMetadata(data, sheet.name)
      const tableId = await storeTable(documentId, data, metadata)

      processed.push({ zone, tableId })
    }

    if (zone.type === "text") {
      // Extract text content
      const content = extractTextContent(sheet, zone.region)
      processed.push({ zone, content })
    }

    if (zone.type === "header") {
      // Extract header, find what it's associated with
      const title = extractHeaderText(sheet, zone.region)
      const nextZone = findNextZone(zones, zone)
      processed.push({
        zone,
        title,
        associatedWith: nextZone?.region ? getZoneId(nextZone.region) : undefined
      })
    }
  }

  return processed
}
```

### Step 5: Build Tree

```typescript
function buildTree(
  fileName: string,
  sheets: { sheet: ParsedSheet, zones: ProcessedZone[] }[]
): PageIndexTree {
  const structure: PageIndexNode[] = []
  const allTables: string[] = []

  for (const { sheet, zones } of sheets) {
    const sheetNode: PageIndexNode = {
      nodeId: generateNodeId(),
      title: sheet.name,
      startPage: 1,  // Sheet-based, not page-based
      endPage: 1,
      summary: "",   // Will be generated
      children: [],
      tableRefs: []
    }

    // Group zones by their associations
    for (const pz of zones) {
      if (pz.tableId) {
        allTables.push(pz.tableId)

        // Check if there's a header for this table
        const header = zones.find(z =>
          z.zone.type === "header" && z.associatedWith === getZoneId(pz.zone.region)
        )

        if (header) {
          // Create child node with table
          sheetNode.children.push({
            nodeId: generateNodeId(),
            title: header.title!,
            startPage: 1,
            endPage: 1,
            summary: "",
            children: [],
            tableRefs: [{ tableId: pz.tableId, position: "inline" }]
          })
        } else {
          // Table directly in sheet node
          sheetNode.tableRefs!.push({ tableId: pz.tableId, position: "inline" })
        }
      }

      if (pz.content) {
        // Text zone becomes child node
        const header = zones.find(z =>
          z.zone.type === "header" && z.associatedWith === getZoneId(pz.zone.region)
        )

        sheetNode.children.push({
          nodeId: generateNodeId(),
          title: header?.title ?? "Content",
          startPage: 1,
          endPage: 1,
          summary: pz.content.slice(0, 200) + "...",  // Temporary
          children: [],
          tableRefs: []
        })
      }
    }

    structure.push(sheetNode)
  }

  return {
    docName: fileName,
    structure,
    totalPages: sheets.length,
    metadata: {
      mode: "excel_multi_sheet",
      tocFound: false,
      processedAt: new Date().toISOString(),
      model: "excel-processor"
    },
    tables: allTables
  }
}
```

### Step 6: Generate Summaries

```typescript
async function addSummaries(tree: PageIndexTree): Promise<PageIndexTree> {
  // Similar to existing PageIndex summary generation
  // but aware of table references

  async function summarizeNode(node: PageIndexNode): Promise<string> {
    const parts: string[] = []

    // Include table descriptions
    if (node.tableRefs?.length) {
      for (const ref of node.tableRefs) {
        const table = await getTableMetadata(ref.tableId)
        parts.push(`Contains table "${table.title}": ${table.description}`)
      }
    }

    // Include text content summaries
    if (node.children.length === 0 && !node.tableRefs?.length) {
      // Leaf text node - summarize content
      parts.push(node.summary)  // Already has content snippet
    }

    // Summarize children
    for (const child of node.children) {
      child.summary = await summarizeNode(child)
    }

    // Generate overall summary
    return await generateSummary(node.title, parts.join('. '))
  }

  for (const sheetNode of tree.structure) {
    sheetNode.summary = await summarizeNode(sheetNode)
  }

  return tree
}
```

## Output Example

**Input:** `quarterly_report.xlsx`
- Sheet 1: "Summary" - Title row + intro text + metrics table
- Sheet 2: "Details" - Large data table with footnotes

**Output Tree:**
```json
{
  "docName": "quarterly_report.xlsx",
  "structure": [
    {
      "nodeId": "0000",
      "title": "Summary",
      "startPage": 1,
      "endPage": 1,
      "summary": "Executive summary with Q3 performance highlights and key metrics table showing revenue, costs, and profit margins.",
      "children": [
        {
          "nodeId": "0001",
          "title": "Introduction",
          "summary": "Overview of Q3 performance and market conditions affecting results.",
          "tableRefs": []
        },
        {
          "nodeId": "0002",
          "title": "Key Metrics",
          "summary": "Performance metrics table with quarterly revenue, costs, and profit data.",
          "tableRefs": [{
            "tableId": "tbl_metrics_001",
            "position": "inline"
          }]
        }
      ],
      "tableRefs": []
    },
    {
      "nodeId": "0010",
      "title": "Details",
      "startPage": 2,
      "endPage": 2,
      "summary": "Detailed transaction data by product and region for Q3 2023.",
      "children": [],
      "tableRefs": [{
        "tableId": "tbl_details_001",
        "position": "inline"
      }]
    }
  ],
  "tables": ["tbl_metrics_001", "tbl_details_001"]
}
```

## Edge Cases

### Multiple Tables in Same Sheet

```
Sheet "Data":
A1:F20  → Table 1 (Sales)
H1:L20  → Table 2 (Inventory)
A25:F40 → Table 3 (Returns)
```

**Solution:** Each table becomes a tableRef, optionally with detected headers as node titles.

### Sheet with Only Text

```
Sheet "Notes":
A1: "Important Information"
A3:A20: Long paragraphs of explanatory text
```

**Solution:** Becomes text node with summary, no tableRefs.

### Complex Merged Cells

```
A1:F1 (merged): "Q3 2023 Financial Report"
A2:C2 (merged): "Revenue Section"
A3:C10: Revenue table
D2:F2 (merged): "Cost Section"
D3:F10: Cost table
```

**Solution:**
- A1:F1 → Sheet title
- A2:C2 → Header for revenue table
- D2:F2 → Header for cost table
- Two separate tables with their headers

### Hidden Sheets/Rows/Columns

**Decision:** Process only visible content by default. Option to include hidden.
