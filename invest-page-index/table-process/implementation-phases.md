# Implementation Phases

## Overview

The table processing system is built in 5 phases, each delivering usable functionality.

```
Phase 1: CSV Support        → Basic end-to-end for single-table files
Phase 2: Excel Support      → Multi-sheet, mixed-content handling
Phase 3: Table Query Agent  → Sophisticated querying with sub-agent
Phase 4: Document Tables    → Extract tables from PDF/DOCX
Phase 5: Advanced Features  → Cross-table queries, relationships
```

---

## Phase 1: CSV Support (Foundation)

**Goal:** Simple end-to-end for single-table files. Proves the architecture works.

### Deliverables

1. **CSV Parser**
   - Delimiter detection (comma, semicolon, tab)
   - Encoding detection
   - Header row detection

2. **Type Inference System** (reusable for all phases)
   - Detect: string, number, date, currency, percentage, boolean
   - Sample-based inference
   - Configurable patterns

3. **Table Storage**
   - AgentTable schema + migration
   - CRUD operations
   - Generate tableId

4. **Basic Tree Generation**
   - Single root node with table reference
   - LLM-generated table description as summary

5. **`readTable` Tool (Basic Version)**
   - Direct query execution (no sub-agent yet)
   - SQL-like queries with DuckDB
   - Simple result formatting

6. **Updated Retrieval Tools**
   - `listDocuments` shows table count + metadata
   - `getDocumentStructure` shows tableRefs with sample data

### Tasks

```
□ Create AgentTable schema (schema.ts)
□ Add migration file
□ Implement CSV parser
  □ Delimiter detection
  □ Encoding handling
  □ Quote/escape handling
□ Implement type inference
  □ Pattern matchers for each type
  □ Sample-based detection
  □ Confidence scoring
□ Implement header detection
  □ Heuristic checks
  □ LLM fallback for ambiguous cases
□ Table metadata generation
  □ LLM prompt for description
  □ Title inference from filename
□ Table storage operations
  □ Insert table
  □ Get table metadata
  □ Get table data
  □ Delete tables by document
□ Tree generation for CSV
  □ Single node with tableRef
  □ Summary = table description
□ Basic readTable tool
  □ DuckDB integration
  □ SQL query execution
  □ Result formatting
□ Update listDocuments
  □ Include table count
  □ Include table metadata array
□ Update getDocumentStructure
  □ Include tableRefs in nodes
  □ Include sample rows
□ File upload handling
  □ Detect CSV file type
  □ Route to CSV pipeline
□ End-to-end testing
  □ Upload CSV
  □ Query via chat
```

### Success Criteria

- Upload `sales.csv` → see it in agent documents
- Chat: "What's in this document?" → agent describes the table
- Chat: "What was the highest revenue month?" → agent queries and answers correctly

---

## Phase 2: Excel Support

**Goal:** Handle multi-sheet, mixed-content Excel files.

### Deliverables

1. **XLSX/XLS Parser**
   - Extract all sheets
   - Preserve formatting metadata
   - Handle merged cells

2. **Zone Detection Algorithm**
   - Find contiguous data regions
   - Identify boundaries (empty rows/cols)
   - Handle multiple regions per sheet

3. **Zone Classification**
   - Heuristic classification (table/text/header)
   - LLM verification for uncertain cases
   - Relationship detection (header → table)

4. **Multi-Zone Tree Generation**
   - Sheet = top-level node
   - Text zones = content nodes
   - Table zones = tableRefs
   - Headers = node titles

5. **Summary Generation**
   - Per-node summaries
   - Table-aware summaries

### Tasks

```
□ XLSX/XLS parser
  □ Library integration (xlsx or exceljs)
  □ Sheet extraction
  □ Cell formatting extraction
  □ Merged region detection
□ Zone detection
  □ Contiguous region finder (flood-fill)
  □ Boundary detection
  □ Region metadata extraction
□ Zone classification
  □ Table heuristics (column consistency, numeric data)
  □ Text heuristics (sentence detection, cell length)
  □ Header heuristics (single row, bold, large font)
  □ LLM classification prompt
  □ Confidence thresholds
□ Zone relationship detection
  □ Header → table association
  □ Footer/footnote detection
□ Multi-zone processing
  □ Process tables → store in AgentTable
  □ Process text → create node content
  □ Associate headers → node titles
□ Tree building for Excel
  □ Sheet hierarchy
  □ Zone ordering within sheet
  □ TableRef placement
□ Summary generation
  □ Table-aware prompts
  □ Include table descriptions in node summaries
□ File upload handling
  □ Detect XLS/XLSX
  □ Route to Excel pipeline
□ End-to-end testing
  □ Multi-sheet Excel
  □ Mixed content sheets
  □ Tables side by side
```

### Success Criteria

- Upload `quarterly_report.xlsx` with 3 sheets (Summary, Data, Notes)
- Agent correctly identifies 2 tables and text content
- Chat: "What tables are in this document?" → lists all tables with descriptions
- Chat: "Summarize the Notes sheet" → summarizes text content correctly

---

## Phase 3: Table Query Sub-Agent

**Goal:** Sophisticated table querying with specialized sub-agent.

### Deliverables

1. **Table Query Sub-Agent**
   - Receives table + expectation
   - Generates optimal query
   - Executes in sandbox
   - Returns structured result + explanation

2. **Query Generation**
   - SQL generation for simple queries
   - Pandas code for complex analysis
   - Query optimization

3. **Execution Sandbox**
   - DuckDB for SQL (already have from Phase 1)
   - Sandboxed Python for pandas
   - Timeout and resource limits

4. **Result Formatting**
   - Multiple result types (value, row, rows, aggregation, comparison)
   - Natural language explanations
   - Query transparency

5. **Error Handling**
   - Column not found
   - Query timeout
   - Ambiguous requests

### Tasks

```
□ Sub-agent architecture
  □ Prompt engineering
  □ Input formatting (table metadata, data, expectation)
  □ Output parsing
□ Query generation
  □ SQL generation guidelines
  □ Pandas code generation guidelines
  □ Query type detection
□ Sandbox execution
  □ DuckDB SQL executor (enhance from Phase 1)
  □ Python sandbox (Pyodide or subprocess)
  □ Timeout handling
  □ Memory limits
□ Result formatting
  □ Result type detection
  □ Data structuring
  □ Explanation generation
□ Update readTable tool
  □ Route to sub-agent instead of direct execution
  □ Handle sub-agent responses
  □ Format for master agent
□ Error handling
  □ Schema validation errors
  □ Query execution errors
  □ Timeout handling
  □ Retry logic
□ Large table handling
  □ Row limit checking
  □ Filter suggestions
  □ Pagination
□ Testing
  □ Simple queries (filter, sort, limit)
  □ Aggregations (sum, avg, count, group by)
  □ Comparisons (quarter over quarter, etc.)
  □ Complex queries (multiple conditions)
```

### Success Criteria

- Chat: "Compare Q1 and Q2 revenue" → sub-agent generates comparison query, returns formatted result
- Chat: "What's the trend in monthly sales?" → sub-agent does trend analysis
- Chat: "Find outliers in the data" → sub-agent identifies statistical outliers
- Query transparency: user can see what query was executed

---

## Phase 4: Document Table Extraction

**Goal:** Extract tables from PDFs and DOCX files.

### Deliverables

1. **Table Detection in OCR**
   - Enable table detection in OCR engine
   - Extract table regions
   - Map tables to page numbers

2. **Table Extraction**
   - Parse detected tables to structured data
   - Clean OCR artifacts
   - Handle complex layouts

3. **Placeholder Injection**
   - Replace table content with `[[TABLE:xxx]]` markers
   - Preserve surrounding context

4. **Pipeline Integration**
   - Tables extracted before PageIndex runs
   - Markers flow through existing pipeline
   - References resolved after tree building

5. **Complex Table Handling**
   - Multi-row headers
   - Merged cells
   - Multi-page tables

### Tasks

```
□ OCR integration
  □ Enable table detection in Google Vision / chosen engine
  □ Parse table detection results
  □ Extract bounding boxes
□ Table extraction
  □ Convert OCR table format to our format
  □ Handle cell spans (rowspan, colspan)
  □ Clean OCR artifacts
□ Type inference for extracted tables
  □ Apply existing type inference
  □ Handle OCR errors gracefully
□ Placeholder system
  □ Generate unique table IDs
  □ Inject markers into content
  □ Preserve text context around tables
□ Pipeline integration
  □ Process tables before PageIndex
  □ Store tables in AgentTable
  □ Pass content with markers to PageIndex
□ Reference resolution
  □ Scan tree nodes for [[TABLE:xxx]]
  □ Convert to tableRefs
  □ Update node summaries
□ Complex table handling
  □ Multi-row header detection
  □ Merged cell handling
  □ Multi-page table continuation detection
□ Content markers in retrieval
  □ Show table placeholder info when retrieving pages
  □ Include table metadata in context
□ Testing
  □ PDF with single table
  □ PDF with multiple tables
  □ Tables across page boundaries
  □ Borderless tables
  □ Complex nested tables
```

### Success Criteria

- Upload PDF with tables → tables detected and extracted
- Chat: "What does the table on page 5 show?" → agent finds and queries table
- Tables are queryable just like CSV/Excel tables
- Existing PageIndex features (TOC, summaries) still work

---

## Phase 5: Advanced Features

**Goal:** Polish, optimize, and add advanced capabilities.

### Deliverables

1. **Table Relationships**
   - Detect foreign key relationships
   - Enable cross-table queries
   - Suggest joins

2. **Cross-Document Queries**
   - Query tables from multiple documents
   - Unified schema matching

3. **Table Versioning**
   - Track table updates
   - Handle re-uploaded documents
   - Version history

4. **Performance Optimization**
   - Large table pagination
   - Query caching
   - Parallel processing

5. **Visualization Recommendations**
   - Suggest chart types
   - Generate chart configurations
   - Export to visualization tools

### Tasks

```
□ Table relationships
  □ Column name matching across tables
  □ Foreign key inference
  □ Relationship storage
□ Cross-table queries
  □ Multi-table context for sub-agent
  □ JOIN query generation
  □ Result merging
□ Cross-document queries
  □ Schema unification
  □ Document context in queries
□ Table versioning
  □ Version tracking schema
  □ Update detection
  □ History storage
□ Performance
  □ Query result caching
  □ Large table streaming
  □ Parallel zone detection
  □ Batch table processing
□ Visualization
  □ Chart type recommendation prompt
  □ Configuration generation
  □ Export formats
□ UI enhancements
  □ Table preview in document view
  □ Query history
  □ Result visualization
```

### Success Criteria

- Query spans multiple tables in same document
- Documents can be re-uploaded with updated data
- Large tables (50k+ rows) are queryable
- Agent suggests visualizations for data

---

## Timeline Summary

| Phase | Focus | Key Milestone |
|-------|-------|---------------|
| 1 | CSV Support | Upload CSV → Query via chat |
| 2 | Excel Support | Multi-sheet, mixed content handling |
| 3 | Query Sub-Agent | Sophisticated analysis capabilities |
| 4 | Document Tables | PDF/DOCX table extraction |
| 5 | Advanced | Cross-table, versioning, visualization |

---

## Dependencies

```
Phase 1 (CSV) ─────┐
                   ├──→ Phase 3 (Query Sub-Agent)
Phase 2 (Excel) ───┘         │
                             │
                             ▼
                    Phase 4 (Document Tables)
                             │
                             ▼
                    Phase 5 (Advanced)
```

- Phase 1 and 2 can run in parallel
- Phase 3 depends on Phase 1 (needs working readTable)
- Phase 4 depends on Phase 3 (needs query sub-agent)
- Phase 5 depends on all previous phases
