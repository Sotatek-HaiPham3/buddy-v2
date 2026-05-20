# Step 8: Split Large Nodes (Recursive)

## Purpose

Split nodes that are too large (exceed token/page limits) into smaller sub-sections.

## Why Split Large Nodes?

Some sections span many pages with no subsections in TOC:

```json
{
  "title": "Detailed Analysis",
  "startIndex": 15,
  "endIndex": 80,    // ← 65 pages! Too large for LLM context
  "nodes": []        // ← No subsections from TOC
}
```

**Issues with large nodes:**
- Exceeds LLM token limit (can't fit in context)
- Too much content to reason about effectively
- Loses granularity for retrieval

## How It Works

### 1. Check if node is too large

```
If node has:
  - More than 10 pages (default: maxPageNumEachNode)
  - AND more than 20,000 tokens (default: maxTokenNumEachNode)
→ Split it
```

**Both conditions must be true** (pages AND tokens).

### 2. Generate sub-structure from content

Since TOC didn't have subsections, use LLM to **analyze the actual content** and find section headings within that range:

```
Pages 15-80 content:
─────────────────────
<page 15>
Introduction to Analysis...

<page 25>
3.1 Market Overview
The market has shown...

<page 40>
3.2 Competitor Analysis
Our main competitors...

<page 60>
3.3 Growth Projections
Based on current trends...
```

LLM identifies these as sub-sections.

### 3. Create child nodes

```json
{
  "title": "Detailed Analysis",
  "startIndex": 15,
  "endIndex": 24,      // ← Now ends before first child
  "nodes": [
    {
      "title": "Market Overview",
      "startIndex": 25,
      "endIndex": 39
    },
    {
      "title": "Competitor Analysis",
      "startIndex": 40,
      "endIndex": 59
    },
    {
      "title": "Growth Projections",
      "startIndex": 60,
      "endIndex": 80
    }
  ]
}
```

### 4. Recursive - repeat until all nodes are small enough

If any new child is still too large, split it again:

```
Detailed Analysis (65 pages)
├── Market Overview (15 pages) ← OK
├── Competitor Analysis (20 pages) ← Still large, split again
│   ├── Direct Competitors (p40-48)
│   └── Indirect Competitors (p49-59)
└── Growth Projections (21 pages) ← Still large, split again
    ├── Short-term Projections (p60-68)
    └── Long-term Projections (p69-80)
```

## Visual Transformation

```
BEFORE SPLIT                        AFTER SPLIT
────────────                        ───────────

Detailed Analysis (p15-80)    →     Detailed Analysis (p15-24)
   (no children)                    ├── Market Overview (p25-39)
   (65 pages - TOO LARGE!)          ├── Competitor Analysis (p40-59)
                                    │   ├── Direct (p40-48)
                                    │   └── Indirect (p49-59)
                                    └── Growth Projections (p60-80)
                                        ├── Short-term (p60-68)
                                        └── Long-term (p69-80)
```

## The Splitting Process

Same process as when no TOC is found:

1. Take content from `startIndex` to `endIndex`
2. Add `<physical_index_X>` tags to mark page boundaries
3. Ask LLM to identify section headings
4. Build sub-tree from LLM response

## Configuration

```yaml
max_page_num_each_node: 10      # Split if more than 10 pages
max_token_num_each_node: 20000  # AND more than 20k tokens
```

## Impact

| Without Split | With Split |
|---------------|------------|
| 65-page section | Multiple 10-15 page sections |
| Can't fit in LLM context | Each section fits in context |
| Coarse retrieval | Fine-grained retrieval |
| "Look at pages 15-80" | "Look at pages 40-48 (Direct Competitors)" |

## Related Edge Cases

- **Chunk Overlap** - 1 page overlap to avoid missing boundaries ([split-processing.md](../edge-cases/split-processing.md))
- **Smart Chunk Sizing** - Uses averaged chunk size for balance ([split-processing.md](../edge-cases/split-processing.md))
- **Single Chunk Optimization** - Skips chunking if fits in one ([split-processing.md](../edge-cases/split-processing.md))
- **Empty Node List Safety** - Safe fallback when no valid items ([split-processing.md](../edge-cases/split-processing.md))
