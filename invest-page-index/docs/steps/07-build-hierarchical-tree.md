# Step 7: Build Hierarchical Tree

## Purpose

Convert flat list into nested tree structure with parent-child relationships and page ranges.

## Input (flat list)

```json
[
  { "structure": "1",   "title": "Executive Summary",   "physicalIndex": 5  },
  { "structure": "1.1", "title": "Financial Overview",  "physicalIndex": 7  },
  { "structure": "1.2", "title": "Risk Assessment",     "physicalIndex": 10 },
  { "structure": "2",   "title": "Detailed Analysis",   "physicalIndex": 15 },
  { "structure": "2.1", "title": "Market Trends",       "physicalIndex": 18 },
  { "structure": "3",   "title": "Conclusion",          "physicalIndex": 40 }
]
```

## Problems with Flat List

- No parent-child relationships
- Don't know where each section **ends**
- Can't navigate hierarchically

## Output (hierarchical tree)

```json
[
  {
    "title": "Executive Summary",
    "startIndex": 5,
    "endIndex": 14,
    "nodes": [
      {
        "title": "Financial Overview",
        "startIndex": 7,
        "endIndex": 9
      },
      {
        "title": "Risk Assessment",
        "startIndex": 10,
        "endIndex": 14
      }
    ]
  },
  {
    "title": "Detailed Analysis",
    "startIndex": 15,
    "endIndex": 39,
    "nodes": [
      {
        "title": "Market Trends",
        "startIndex": 18,
        "endIndex": 39
      }
    ]
  },
  {
    "title": "Conclusion",
    "startIndex": 40,
    "endIndex": 50
  }
]
```

## What This Step Does

### 1. Determines Parent-Child Relationships

Based on `structure` field:

```
1. Executive Summary          ← parent
   1.1 Financial Overview     ← child of 1
   1.2 Risk Assessment        ← child of 1
2. Detailed Analysis          ← parent
   2.1 Market Trends          ← child of 2
3. Conclusion                 ← parent (no children)
```

### 2. Calculates endIndex for Each Section

A section **ends** where the next sibling or parent's next sibling **starts**:

```
Section 1 starts at page 5
Section 2 starts at page 15
→ Section 1 ends at page 14 (one before Section 2)

Section 1.1 starts at page 7
Section 1.2 starts at page 10
→ Section 1.1 ends at page 9 (one before 1.2)
```

### 3. Nests Children Under Parents

```
Before:  [1, 1.1, 1.2, 2, 2.1, 3]  (flat)

After:   [
           1 → [1.1, 1.2],
           2 → [2.1],
           3
         ]                         (nested)
```

## Visual Transformation

```
FLAT LIST                           HIERARCHICAL TREE
─────────────                       ─────────────────

1. Executive Summary (p5)     →     Executive Summary (p5-14)
1.1 Financial Overview (p7)         ├── Financial Overview (p7-9)
1.2 Risk Assessment (p10)           └── Risk Assessment (p10-14)
2. Detailed Analysis (p15)    →     Detailed Analysis (p15-39)
2.1 Market Trends (p18)             └── Market Trends (p18-39)
3. Conclusion (p40)           →     Conclusion (p40-50)
```

## Parent Structure Parsing

Structure hierarchy is determined by splitting on `.`:

```python
def get_parent_structure(structure):
    if not structure:
        return None
    parts = str(structure).split('.')
    return '.'.join(parts[:-1]) if len(parts) > 1 else None

# Examples:
# "1"     → None (root)
# "1.1"   → "1"
# "1.1.1" → "1.1"
# "2.3.4" → "2.3"
```

## Why This Matters for RAG

With hierarchical tree, LLM can reason:

> "User asks about risk. Let me check... 'Risk Assessment' is under 'Executive Summary'. I should look at pages 10-14."

Instead of searching all pages, it navigates the tree structure like a human would.

## Related Edge Cases

- **Orphan Node Handling** - Nodes without parents become roots ([tree-building.md](../edge-cases/tree-building.md))
- **Tree Conversion Fallback** - Returns flat list if tree fails ([tree-building.md](../edge-cases/tree-building.md))
- **Duplicate Title Handling** - Skips child with same title as parent ([tree-building.md](../edge-cases/tree-building.md))
