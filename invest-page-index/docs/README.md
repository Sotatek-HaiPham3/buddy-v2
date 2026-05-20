# PageIndex Documentation

Vectorless Reasoning-Based RAG System

## Overview

PageIndex transforms PDFs into hierarchical tree structures **without using vector databases**. Instead of semantic similarity search, it uses **LLM reasoning** to navigate and retrieve relevant sections.

**Key Insight:** Similarity ≠ Relevance. Vector search finds similar text, but reasoning finds relevant answers.

## Comparison

| Traditional RAG | PageIndex RAG |
|-----------------|---------------|
| PDF → Chunk → Embed → Vector DB → Query by similarity | PDF → Detect TOC → Build tree → Query by LLM reasoning |

## Documentation Structure

```
docs/
├── README.md                    # This file
├── pipeline-overview.md         # High-level pipeline flow
├── fallback-modes.md            # Fallback chain when processing fails
├── configuration.md             # Config options and defaults
├── logging.md                   # Logging system
├── query-retrieval.md           # Phase 2: Query-time usage
│
├── image-solution.md            # Visual content processing (detailed)
├── image-solution-concept.md    # Image integration concept & architecture
│
├── steps/                       # Pipeline step details
│   ├── 01-pdf-extraction.md
│   ├── 02-toc-detection.md
│   ├── 03-toc-content-extraction.md
│   ├── 04-page-number-detection.md
│   ├── 05-toc-transformation.md
│   ├── 06-physical-page-mapping.md
│   ├── 07-build-hierarchical-tree.md
│   ├── 08-split-large-nodes.md
│   ├── 09-add-summaries.md
│   └── 10-output-json-tree.md
│
└── edge-cases/                  # Error handling details
    ├── input-validation.md      # Cases 2, 3, 19
    ├── toc-processing.md        # Cases 1, 11, 22, 34, 35
    ├── physical-mapping.md      # Cases 5, 6, 15, 23, 31
    ├── tree-building.md         # Cases 7, 17, 33, 37
    ├── split-processing.md      # Cases 4, 24, 25, 29
    ├── verification-fix.md      # Cases 27, 28, 32
    ├── llm-response.md          # Cases 8, 9, 14, 20, 21, 26
    ├── summary-generation.md    # Cases 13, 30
    ├── format-conversion.md     # Cases 15, 16, 18
    └── api-retry.md             # API retry mechanism
```

## Quick Start

```python
from pageindex import page_index

# Use defaults
result = page_index("document.pdf")

# Override specific options
result = page_index(
    "document.pdf",
    model="gpt-4o",
    max_page_num_each_node=15,
    if_add_node_summary="no"
)
```

## Output Format

```json
{
  "doc_name": "annual-report-2023.pdf",
  "doc_description": "2023 financial report covering...",
  "structure": [
    {
      "title": "Executive Summary",
      "start_index": 1,
      "end_index": 14,
      "node_id": "0000",
      "summary": "Overview of financial performance...",
      "nodes": [...]
    }
  ]
}
```

## Key Features

1. **TOC Detection** - Automatically finds Table of Contents
2. **Physical Page Mapping** - Maps TOC page numbers to actual PDF pages
3. **Verification & Fix** - Verifies mappings and auto-fixes errors
4. **Large Node Splitting** - Recursively splits oversized sections
5. **Parallel Summaries** - Generates summaries concurrently
6. **Fallback Chain** - Multiple fallback modes for edge cases

## Limitations (Current)

- **No image/visual content extraction** - Only text is processed
- See [image-solution-concept.md](image-solution-concept.md) for proposed enhancement
