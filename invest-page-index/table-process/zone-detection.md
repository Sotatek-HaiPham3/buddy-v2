# Zone Detection Strategy

## The Problem

Files can contain mixed content:
- Excel file with financial data table + explanatory text blocks
- PDF with paragraphs of text + embedded tables
- DOCX with tables interspersed in text

We need to **detect and separate** these zones.

## Zone Types

```typescript
type ZoneType = "text" | "table" | "header" | "footer" | "image"

interface ContentZone {
  zoneId: string
  type: ZoneType

  // Location
  page?: number           // For documents
  sheet?: string          // For spreadsheets
  startRow?: number       // Row-based position
  endRow?: number
  startCol?: number       // Column-based position
  endCol?: number

  // Content
  content: string | any[][] // Text string or table data

  // Relationships
  precedingZone?: string
  followingZone?: string
}
```

## Detection Strategies by File Type

### PDF/DOCX Tables

```
Strategy: OCR + Layout Analysis + LLM Verification

1. During OCR, detect table boundaries (most OCR engines support this)
2. Extract table as structured data (rows/columns)
3. In extracted text, replace table with placeholder:
   "[[TABLE:tbl_abc123]]"
4. LLM verifies: "Is this actually a table or formatted text?"
```

**Table Detection Signals:**
- Grid lines in PDF
- Consistent column alignment
- Repeating row patterns
- Header row with different formatting

### CSV Files

```
Strategy: Entire file is one table

1. Parse CSV
2. Infer column types from data
3. Detect if first row is header
4. Store as single table
5. Create minimal tree: one node referencing the table
```

No zone detection needed - the whole file is the table.

### XLS/XLSX Files (Complex Case)

```
Strategy: Zone Detection Agent

1. For each sheet:
   a. Scan for rectangular data regions (contiguous non-empty cells)
   b. Scan for text blocks (isolated cells with long text)
   c. Scan for headers/titles (large font, bold, etc.)

2. Zone Detection Agent analyzes:
   - "Is region A1:F50 a table or formatted document?"
   - "Is cell H1 a title for the table below it?"
   - "Are cells A52:A55 footnotes or separate content?"

3. Output zone map:
   [
     {type: "header", range: "A1:F1", content: "Financial Report"},
     {type: "table", range: "A3:F50", tableId: "tbl_001"},
     {type: "text", range: "A52:F55", content: "Notes: ..."},
     {type: "table", range: "H3:L30", tableId: "tbl_002"}
   ]
```

## Zone Detection Algorithm (Excel)

### Step 1: Find Data Regions

```python
def find_data_regions(sheet):
    """Find all rectangular regions with contiguous data"""
    regions = []
    visited = set()

    for cell in sheet.cells:
        if cell.position in visited or cell.is_empty:
            continue

        # Flood-fill to find region boundary
        region = expand_region(cell, sheet, visited)
        if region.cell_count > 1:  # Ignore single cells
            regions.append(region)

    return regions
```

### Step 2: Classify Regions

```python
def classify_region(region, sheet):
    """Determine if region is table, text, or header"""

    # Check for table characteristics
    has_consistent_columns = check_column_alignment(region)
    has_numeric_data = count_numeric_cells(region) > 0.3 * region.cell_count
    has_header_row = detect_header_row(region)
    row_count = region.end_row - region.start_row

    # Check for text characteristics
    avg_cell_length = average_text_length(region)
    has_sentences = contains_sentences(region)

    # Check for header characteristics
    is_single_row = row_count == 1
    has_large_font = check_font_size(region) > normal_size

    # Classification logic
    if is_single_row and has_large_font:
        return "header"
    elif has_consistent_columns and (has_numeric_data or has_header_row):
        return "table"
    elif has_sentences and avg_cell_length > 50:
        return "text"
    else:
        return "uncertain"  # Send to LLM for classification
```

### Step 3: LLM Verification

For uncertain regions, use LLM:

```
You are analyzing a spreadsheet region. Determine if it's a TABLE or TEXT.

Region: A10:F25
Sample content:
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Product | Q1 | Q2 | Q3 | Q4 | Total |
| Widget A | 100 | 120 | 115 | 140 | 475 |
| Widget B | 85 | 90 | 88 | 95 | 358 |
...

Is this a TABLE (structured data) or TEXT (prose/document)?

Answer: TABLE

Reasoning: Consistent columns, header row, numeric data pattern, aggregation column.
```

## Zone Detection Agent Prompt

```
You are a document structure analyzer. Given a spreadsheet/document region,
determine what type of content it contains.

## Zone Types
- TABLE: Structured data with consistent columns, numeric/categorical data
- TEXT: Prose, paragraphs, explanatory content
- HEADER: Titles, section headings
- FOOTER: Footnotes, references, disclaimers
- MIXED: Contains both table and text (needs splitting)

## Analysis Approach
1. Check for consistent column structure (suggests table)
2. Check for sentence-like content (suggests text)
3. Check for formulas/calculations (suggests table)
4. Check for merged cells with long text (suggests header/text)

## For Excel/Spreadsheet Input
Input: Cell data with positions and formatting hints
Output: List of zones with boundaries and types

## For Document Input (PDF/DOCX)
Input: Extracted content with layout hints
Output: Inline table markers and boundaries
```

## Edge Cases

### 1. Table with Text Header

```
A1: "Quarterly Sales Report" (merged, bold)
A2: (empty row)
A3:F20: Actual table data
```

**Solution:** Detect header zone A1, associate with table zone A3:F20

### 2. Multiple Tables Side by Side

```
A1:D10: Table 1
F1:H10: Table 2
```

**Solution:** Separate tables detected by empty column E

### 3. Table with Footnotes

```
A1:F50: Table data
A52:F55: "* Values in millions. ** Excludes one-time items."
```

**Solution:** Table zone + footer zone, footer becomes note in node

### 4. Pivoted/Transposed Layout

```
A1: "Metric"   B1: "Q1"   C1: "Q2"   D1: "Q3"
A2: "Revenue"  B2: 1000   C2: 1100   D2: 1200
A3: "Costs"    B3: 800    C3: 850    D3: 900
```

**Solution:** Still a table - columns are quarters, rows are metrics

### 5. Sparse Table with Empty Cells

```
A1:F20 with many empty cells in the middle
```

**Solution:** Check if structure is consistent despite gaps; may be intentional nulls

## Output Format

```typescript
interface ZoneMap {
  sheetName: string
  zones: ContentZone[]
  relationships: ZoneRelationship[]
}

interface ZoneRelationship {
  fromZone: string
  toZone: string
  type: "title_for" | "footnote_for" | "continues" | "related"
}
```

## Integration with Pipeline

```
Excel File
    │
    ▼
Parse all sheets
    │
    ▼
For each sheet:
    ├── Find data regions
    ├── Classify regions (table/text/header)
    ├── LLM verify uncertain regions
    └── Build zone map
    │
    ▼
Process zones:
    ├── TABLE zones → Table store
    ├── TEXT zones → Tree nodes
    └── HEADER zones → Node titles
    │
    ▼
Build unified tree
```
