# Table Processing System

## Overview

This system extends PageIndex to support tabular data from various sources (CSV, XLS, XLSX, and tables embedded in documents).

## Problem Statement

### Current State
- PageIndex processes PDFs and documents into hierarchical trees
- Text content is extracted, organized, and summarized
- Agent retrieves content by page ranges using reasoning
- **No support for structured tabular data**

### Challenges
1. **Tables in documents** - PDFs and DOCX files contain embedded tables lost during text extraction
2. **Spreadsheet files** - CSV, XLS, XLSX files have no native support
3. **Mixed content files** - Excel files can contain both tabular data AND document-like content
4. **Token inefficiency** - Raw table data consumes massive context when retrieved as text
5. **Reasoning over tables** - LLMs struggle to reason accurately over large tables in raw text format

### Solution

Create a unified processing system where:
- **All inputs** (PDF, DOCX, CSV, XLS, XLSX) output to the **same tree structure**
- **Tables are extracted and stored separately** with unique IDs
- **Tree references tables by ID** instead of embedding raw data
- **Agent queries tables via specialized tool** with sub-agent handling actual data operations
- **No raw table data in context** - agent works with table metadata and query results only

## Architecture

```
┌─────────────────┐
│ Input File      │
│ (PDF/DOC/XLS/   │
│  CSV/XLSX)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Zone Detection  │
│ Agent           │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌────────┐
│ Text  │ │ Table  │
│ Zones │ │ Zones  │
└───┬───┘ └────┬───┘
    │          │
    ▼          ▼
┌───────┐ ┌────────┐
│ Tree  │ │ Table  │
│ Nodes │ │ Store  │
└───┬───┘ └────┬───┘
    │          │
    └────┬─────┘
         │
         ▼
┌─────────────────┐
│ PageIndexTree   │
│ (with table     │
│  references)    │
└─────────────────┘
```

## Documentation Structure

| File | Description |
|------|-------------|
| [concepts.md](./concepts.md) | Core concepts: table references, storage, query pattern |
| [zone-detection.md](./zone-detection.md) | How to detect table vs text zones in mixed files |
| [pipelines/](./pipelines/) | Processing pipelines per file type |
| [table-query-tool.md](./table-query-tool.md) | Master agent tool + sub-agent design |
| [schema.md](./schema.md) | Database schema changes |
| [implementation-phases.md](./implementation-phases.md) | Phased implementation plan |
| [open-questions.md](./open-questions.md) | Unresolved design questions |
| [examples.md](./examples.md) | Example inputs and outputs |

## Key Principles

1. **Unified Output** - All file types produce PageIndexTree format
2. **Table Separation** - No raw table data in tree content or context
3. **Metadata Visibility** - Agent can reason about tables without loading data
4. **Two-Level Query** - Master agent delegates to table query sub-agent
5. **Token Efficiency** - Table queries use <2000 tokens regardless of table size
