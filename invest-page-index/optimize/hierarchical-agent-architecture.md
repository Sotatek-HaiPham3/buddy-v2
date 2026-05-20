# PageIndex Hierarchical Agent Architecture

## Overview

This document describes the optimized architecture for extracting Table of Contents (TOC) from large PDF documents using a 3-level hierarchical agent system.

---

## Problem Statement

### Current Issues

1. **Sequential Processing**: Groups within large nodes processed one-by-one
2. **Excessive Continuations**: 5+ iterations needed for 53 entries due to growing chat history
3. **Verbose Output**: JSON format wastes tokens
4. **Poor Hierarchy Detection**: Each agent only sees local context (20k tokens)

### Example: IATA Document (1144 pages)

```
Current Performance:
- Chapter 3: 742 pages, 44 groups
- Processing: 44 groups × 5 continuations = 220 API calls
- Time: ~660 seconds (sequential)
- Many truncation errors
```

---

## Solution: 3-Level Hierarchical Agent Architecture

### Architecture Diagram

```
Document (1144 pages)
│
├── Chapter 3 (pages 77-818, 742 pages)
│   │
│   └── Chapter Master Agent
│       │
│       ├── Group 1 Master (pages 77-95)
│       │   ├── Sub-group 1a (6k tokens) → ["Heading A", 78], ["Heading B", 82]
│       │   ├── Sub-group 1b (6k tokens) → ["Heading C", 88], ["Heading D", 91]
│       │   └── Sub-group 1c (6k tokens) → ["Heading E", 94]
│       │   └── MERGE → [["1", "Heading A", 78], ["1.1", "Heading B", 82], ...]
│       │
│       ├── Group 2 Master (pages 95-113)
│       │   ├── Sub-group 2a → headings
│       │   ├── Sub-group 2b → headings
│       │   └── Sub-group 2c → headings
│       │   └── MERGE → structured TOC
│       │
│       ├── ... (44 groups, all parallel)
│       │
│       └── FINAL MERGE → Complete TOC for Chapter 3
│
├── Chapter 9 (pages 850-1144, 295 pages) [PARALLEL with Chapter 3]
│   └── Similar hierarchical structure...
│
└── Final Document TOC
```

---

## Agent Types

### 1. Sub-group Agent (Leaf Level)

**Purpose**: Find section headings in a small chunk of content

**Input**: ~6k tokens of document content

**Output**: Simple heading list (no structure numbering)
```json
[
    ["Introduction", 85],
    ["Background", 87],
    ["Methods", 90]
]
```

**Prompt**:
```
Extract all section headings from the text below.

For each heading, output: [title, page_number]

Output format (JSON array of arrays):
[
    ["Introduction", 85],
    ["Background", 87],
    ...
]

Only extract clear section/chapter headings, not every bold text.
Output ONLY the JSON array, nothing else.

Text:
{content}
```

**Key Properties**:
- Simple task: just find headings
- Small context: 6k tokens, no truncation
- No structure numbering (that's the master's job)
- Fast execution: single API call

---

### 2. Group Master Agent (Middle Level)

**Purpose**: Merge sub-group results and determine hierarchy

**Input**: Heading lists from 3 sub-groups

**Output**: Structured TOC with hierarchy numbers
```json
[
    ["1", "Introduction", 85],
    ["1.1", "Background", 87],
    ["1.2", "Methods", 90],
    ["2", "Results", 95]
]
```

**Capabilities**:
- Merge and deduplicate headings
- Determine parent-child relationships
- Assign structure numbers (1, 1.1, 1.1.1, etc.)
- **Retrieve specific pages** if uncertain about hierarchy

**Retrieval Tool**:
```python
# If uncertain, master can request page content:
{"action": "retrieve", "pages": [90, 91], "reason": "Need to check if Results is under Methods"}

# System retrieves content and adds to prompt:
"Retrieved content for pages 90-91: ..."

# Master then makes final decision
```

---

### 3. Chapter Master Agent (Root Level)

**Purpose**: Merge all group TOCs into final chapter TOC

**Input**: TOCs from all groups (e.g., 44 group TOCs)

**Output**: Complete chapter TOC with proper structure prefix
```json
[
    ["3.1", "Introduction", 85],
    ["3.1.1", "Background", 87],
    ["3.2", "Methods", 90],
    ...
]
```

**Capabilities**:
- Merge group TOCs in page order
- Resolve boundary conflicts between groups
- Renumber all structures with chapter prefix
- **Retrieve specific pages** for boundary resolution

---

## Key Design Principles

### 1. Separation of Concerns

| Agent | Task | Complexity |
|-------|------|------------|
| Sub-group | Find headings | Simple |
| Group Master | Determine hierarchy | Medium |
| Chapter Master | Merge & renumber | Medium |

**Why**: Each agent has a focused task, easier to debug and optimize

### 2. Small Context, No Continuation

| Level | Context Size | Continuation Needed? |
|-------|--------------|---------------------|
| Sub-group | 6k tokens | No |
| Group Master | ~2k tokens (heading lists) | No |
| Chapter Master | ~5k tokens (group TOCs) | Rarely |

**Why**: Small context = output fits in single call = no truncation

### 3. Masters See Full Picture

```
Current: Each agent sees 20k tokens → guesses structure locally
New: Masters see ALL headings → better hierarchy decisions
```

### 4. Retrieval for Uncertainty

When hierarchy is ambiguous, masters can request specific page content:

```
Sub-group 1 ends:   ["Methods", 90]
Sub-group 2 starts: ["Results", 91]

Master uncertain: Is "Results" under "Methods" (1.1) or sibling (2)?

Master requests: RETRIEVE(90, 91)
System returns: Page content showing "Results" is a major heading
Master decides: "Results" is sibling → structure "2"
```

---

## Parallelism

### Execution Flow

```
Time →

T0: All 132 sub-group agents start (parallel)
    ├── Sub-group 1a ─────────────┐
    ├── Sub-group 1b ─────────────┼── Group 1 Master
    ├── Sub-group 1c ─────────────┘         │
    ├── Sub-group 2a ─────────────┐         │
    ├── Sub-group 2b ─────────────┼── Group 2 Master ──┐
    ├── Sub-group 2c ─────────────┘         │          │
    └── ... (all 132 parallel)              │          │
                                            ↓          ↓
T1: All 44 group masters start (parallel)   │          │
    ├── Group 1 Master ─────────────────────┼──────────┤
    ├── Group 2 Master ─────────────────────┼──────────┤
    └── ... (all 44 parallel)               │          │
                                            ↓          ↓
T2: Chapter Master merges all ──────────────┴──────────┘
                                            │
                                            ↓
T3: Final TOC
```

### Concurrency Numbers

| Level | Agents | Parallel? |
|-------|--------|-----------|
| Sub-groups | 132 | Yes, all concurrent |
| Group Masters | 44 | Yes, all concurrent (after sub-groups) |
| Chapter Master | 1 | Sequential (final step) |

---

## Edge Cases

### Sub-group Edge Cases

| Case | Example | Solution |
|------|---------|----------|
| No headings found | Blank/image pages | Return empty, master handles |
| Too many headings | Every paragraph | Prompt: "only clear section headings" |
| Heading at boundary | Title on last line | Overlap sub-groups by 1 page |
| API failure | Network error | Return empty, log, master continues |

### Group Master Edge Cases

| Case | Example | Solution |
|------|---------|----------|
| Duplicate headings | Same from 2 sub-groups | Dedupe by page number |
| Hierarchy ambiguous | Is "Results" under "Methods"? | Retrieve pages to check |
| All sub-groups failed | No headings | Return empty, chapter master handles |
| Too many retrievals | Every boundary uncertain | Limit to 3, use heuristics |

### Chapter Master Edge Cases

| Case | Example | Solution |
|------|---------|----------|
| Group boundary conflict | G1 ends "3.2", G2 starts "1" | Renumber G2 to continue |
| Missing group | Group 5 failed | Skip, note gap |
| Overlapping pages | Due to overlap setting | Dedupe by title + page |

---

## Output Format Optimization

### Sub-group Output (simplest)
```json
[["Title", page], ...]
```
~25 characters per entry

### Master Output (with structure)
```json
[["structure", "Title", page], ...]
```
~40 characters per entry

### Compared to Current
```json
{"structure": "9.1", "title": "Title", "physical_index": "<physical_index_850>"}
```
~100 characters per entry

**Savings: 50-75%**

---

## Performance Comparison

| Metric | Current | Optimized |
|--------|---------|-----------|
| Time (Chapter 3, 44 groups) | ~660s | ~6s |
| API calls | 220 | 177 |
| Token usage per call | 20k+ (growing) | 6k (fixed) |
| Continuation loops | 5 per group | 0 |
| Error recovery | All fail | Partial success |

### Speed Improvement: **~110x faster**

---

## Implementation

### New Functions

```python
# Sub-group agent
async def subgroup_heading_extractor(content, model=None):
    """Find headings in content chunk."""
    ...

# Group master agent
async def group_master_agent(sub_group_results, page_list, model=None):
    """Merge sub-groups, determine hierarchy, with retrieval."""
    ...

# Chapter master agent
async def chapter_master_agent(group_tocs, page_list, chapter_structure, model=None):
    """Merge groups, renumber for chapter."""
    ...

# Orchestrator
async def process_large_node_hierarchical(node, page_list, opt, logger):
    """Process large node using hierarchical agents."""
    ...
```

### Config Options

```yaml
# config.yaml
hierarchical_processing: true
subgroup_token_size: 7000
max_retrievals_per_master: 3
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `page_index.py` | Add all new agent functions |
| `page_index.py` | Update `process_large_node_recursively()` |
| `config.yaml` | Add hierarchical processing options |

---

## Testing

1. **Unit Tests**: Test each agent type independently
2. **Integration Test**: Run on small document (50 pages)
3. **Performance Test**: Run on IATA document (1144 pages)
4. **Accuracy Test**: Compare output with current implementation

### Success Criteria

- [ ] Processing time < 30s for 1000+ page document
- [ ] No continuation loops (all calls complete in 1 round)
- [ ] Accuracy >= current implementation
- [ ] Graceful handling of failures (partial success)
