# PageIndex: Vectorless Reasoning-Based RAG

## Overview

PageIndex is a document indexing system that transforms PDFs into hierarchical tree structures **without using vector databases**. Instead of semantic similarity search, it uses **LLM reasoning** to navigate and retrieve relevant sections.

**Key Insight:** Similarity ≠ Relevance. Vector search finds similar text, but reasoning finds relevant answers.

---

## Core Concept

Traditional RAG:
```
PDF → Chunk into pieces → Embed chunks → Store in Vector DB → Query by similarity
```

PageIndex RAG:
```
PDF → Detect TOC → Build hierarchical tree → Query by LLM reasoning
```

---

## Phase 1: Index Generation Pipeline

### Pipeline Overview

```
Step 1:  PDF Extraction           → Extract text + tokens per page
Step 2:  TOC Detection            → Find TOC pages (LLM)
Step 3:  TOC Content Extraction   → Concatenate + regex cleanup
Step 4:  Page Number Detection    → Check if TOC has page numbers (LLM)
Step 5:  TOC Transformation       → Text → JSON (LLM)
Step 6:  Physical Page Mapping    → Map TOC pages → PDF pages
Step 6.5: Validate Indices        → Remove out-of-bounds indices
Step 6.6: Verification & Fix      → Verify + fix incorrect mappings (LLM)
Step 6.7: Add Preface             → Auto-add Preface if needed
Step 6.8: Check Title at Start    → Affects end_index calculation (LLM)
Step 7:  Build Hierarchical Tree  → Flat list → nested tree
Step 8:  Split Large Nodes        → Recursive splitting (LLM)
Step 9:  Add Summaries            → Parallel summary generation (LLM)
Step 10: Output JSON Tree         → Add IDs, save to file
```

---

### Step 1: PDF Extraction

**Input:** PDF file
**Output:** List of pages with text and token counts

```
[
  { pageNumber: 1, text: "...", tokenCount: 450 },
  { pageNumber: 2, text: "...", tokenCount: 523 },
  ...
]
```

### Step 2: TOC Detection

**Purpose:** Find which pages contain a Table of Contents

**Process:**
1. Scan first N pages (default: 20)
2. For each page, ask LLM: "Is this a Table of Contents?"
3. Stop when consecutive TOC pages end

**LLM Prompt:**
```
Your job is to detect if there is a table of content in the given text.

Given text: {page_content}

Return JSON:
{
    "thinking": "<reasoning>",
    "toc_detected": "yes" or "no"
}

Note: abstract, summary, figure list, table list are NOT table of contents.
```

**Output:** List of TOC page indices, e.g., `[2, 3]`

### Step 3: TOC Content Extraction

**Purpose:** Concatenate TOC pages and normalize formatting

**Process:**
1. Concatenate all TOC pages into single text
2. Replace dots `......` with colons `:` using **regex** (not LLM)

**Code:**
```python
def toc_extractor(page_list, toc_page_list, model):
    # 1. Concatenate TOC pages
    toc_content = ""
    for page_index in toc_page_list:
        toc_content += page_list[page_index][0]

    # 2. Replace dots with colons (regex, not LLM)
    toc_content = re.sub(r'\.{5,}', ': ', toc_content)      # ..... → :
    toc_content = re.sub(r'(?:\. ){5,}\.?', ': ', toc_content)  # . . . . → :

    return toc_content
```

**Example:**

Input (concatenated TOC pages):
```
Company Report 2023

Table of Contents

1. Executive Summary .............. 1
   1.1 Overview ................... 3
2. Analysis ....................... 10

Page 2 of 50
```

Output (dots replaced):
```
Company Report 2023

Table of Contents

1. Executive Summary: 1
   1.1 Overview: 3
2. Analysis: 10

Page 2 of 50
```

**Note:** Headers/footers are NOT removed at this step - they get filtered out later during JSON transformation (Step 5).

### Step 4: Page Number Detection

**Purpose:** Check if the TOC contains page numbers

**Process:** Ask LLM if page numbers exist in the cleaned TOC

**LLM Prompt:**
```
Your job is to detect if there are page numbers/indices in the table of contents.

Given text: {toc_content}

Return JSON:
{
    "thinking": "<reasoning>",
    "page_index_given_in_toc": "yes" or "no"
}
```

**Why this matters:**
- **YES** → Use page numbers directly (fast path)
- **NO** → Must scan entire document to find section locations (slow path)

### Step 5: TOC Transformation (Text → JSON)

**Purpose:** Convert cleaned TOC text into structured JSON that code can work with

**Why this step is needed:**

| Text Format | JSON Format |
|-------------|-------------|
| Hard to parse programmatically | Easy to iterate and process |
| Hierarchy unclear | `structure` field shows hierarchy (1, 1.1, 1.2) |
| Can't easily extract page numbers | `page` field is a number |

**Before (cleaned TOC text from Step 3):**
```
1. Executive Summary: 1
   1.1 Financial Overview: 5
   1.2 Risk Assessment: 8
2. Detailed Analysis: 15
   2.1 Market Trends: 18
   2.2 Competitor Review: 25
3. Conclusion: 40
```

This is still just **plain text** - cleaned, but not structured data yet.

**After (Transform to JSON):**
```json
[
  { "structure": "1",   "title": "Executive Summary",   "page": 1  },
  { "structure": "1.1", "title": "Financial Overview",  "page": 5  },
  { "structure": "1.2", "title": "Risk Assessment",     "page": 8  },
  { "structure": "2",   "title": "Detailed Analysis",   "page": 15 },
  { "structure": "2.1", "title": "Market Trends",       "page": 18 },
  { "structure": "2.2", "title": "Competitor Review",   "page": 25 },
  { "structure": "3",   "title": "Conclusion",          "page": 40 }
]
```

Now it's **structured data** that code can work with.

**LLM Prompt:**
```
Transform the table of contents into JSON format.

"structure" is the hierarchy index (1, 1.1, 1.2, 2, etc.)

Response format:
{
  "table_of_contents": [
    { "structure": "1", "title": "Executive Summary", "page": 1 },
    { "structure": "1.1", "title": "Overview", "page": 3 },
    { "structure": "2", "title": "Analysis", "page": 10 }
  ]
}

Given table of contents:
{cleaned_toc_text}
```

**Continuation Handling (Error Recovery):**

Large TOCs may exceed LLM output token limits. The system handles this:

```python
def toc_transformer(toc_content, model=None):
    response, finish_reason = ChatGPT_API_with_finish_reason(model, prompt)

    # Check if transformation is complete
    if_complete = check_if_toc_transformation_is_complete(toc_content, response, model)

    if if_complete == "yes" and finish_reason == "finished":
        return extract_json(response)

    # If incomplete, continue generating
    while not (if_complete == "yes" and finish_reason == "finished"):
        prompt = "please continue the json structure..."
        new_response = ChatGPT_API(model, prompt)
        response = response + new_response
        if_complete = check_if_toc_transformation_is_complete(...)
```

The `check_if_toc_transformation_is_complete()` function asks the LLM to verify if the JSON output contains all items from the raw TOC.

**Flow:**
```
┌────────────────────────────────────────────────────────────────┐
│  Step 3: Extract TOC Content                                   │
│  Output: "1. Executive Summary: 1\n   1.1 Overview: 5\n..."    │
│          (dots replaced, but still raw text)                   │
└────────────────────────────────┬───────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 5: Transform to JSON                                     │
│  Output: [{ structure: "1", title: "...", page: 1 }, ...]      │
│          (structured data, noise filtered out)                 │
└────────────────────────────────┬───────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 6: Map to Physical Page Numbers                          │
│  Output: [{ structure: "1", title: "...", physicalIndex: 5 }]  │
│          (mapped to actual PDF pages)                          │
└────────────────────────────────┬───────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 6.5: Verification & Fix                                  │
│  Verify each entry, fix incorrect mappings                     │
└────────────────────────────────────────────────────────────────┘
```

### Step 6: Physical Page Mapping

**Purpose:** Map TOC page numbers to actual PDF page indices

**Problem:** TOC says "page 1" but actual content might start at PDF page 5 (due to cover, preface, etc.)

**Detailed Process:**

**1. Get JSON TOC from Step 5:**
```json
[
  { "structure": "1", "title": "Executive Summary", "page": 1 },
  { "structure": "1.1", "title": "Overview", "page": 3 },
  { "structure": "2", "title": "Analysis", "page": 10 }
]
```

**2. Search first N pages AFTER TOC for section titles:**

Add `<physical_index_X>` tags to mark page boundaries:
```
<physical_index_5>
Executive Summary
This report presents our findings...
<physical_index_5>

<physical_index_6>
The year 2023 saw significant growth...
<physical_index_6>
```

**3. Ask LLM to find where titles appear (`toc_index_extractor`):**

**LLM Prompt:**
```
You are given a table of contents in JSON format and several pages of a document.
Add the physical_index to the table of contents.

The provided pages contain tags like <physical_index_X> to indicate page location.

Response format:
[
  { "structure": "1", "title": "Executive Summary", "physical_index": "<physical_index_5>" },
  ...
]
```

**4. Match TOC entries with found physical indices:**
```
TOC entry: { title: "Executive Summary", page: 1 }
Found at:  { title: "Executive Summary", physical_index: 5 }
→ Match!
```

**5. Calculate offset using MOST COMMON difference:**
```python
def calculate_page_offset(pairs):
    differences = [pair['physical_index'] - pair['page'] for pair in pairs]
    # Return most common difference
    return most_common(differences)
```

```
Executive Summary: physical 5 - page 1 = 4
Overview: physical 7 - page 3 = 4
Analysis: physical 14 - page 10 = 4
→ Most common offset = 4
```

**6. Apply offset to ALL entries:**
```python
for item in toc:
    item['physical_index'] = item['page'] + offset
    del item['page']
```

**7. Handle entries that still don't have physical_index:**

Some TOC entries might not have page numbers (e.g., sub-sections without explicit pages). The `process_none_page_numbers()` function handles these:

```python
def process_none_page_numbers(toc_items, page_list, start_index=1, model=None):
    for i, item in enumerate(toc_items):
        if "physical_index" not in item:
            # Find previous known physical_index
            prev_physical_index = 0
            for j in range(i - 1, -1, -1):
                if toc_items[j].get('physical_index') is not None:
                    prev_physical_index = toc_items[j]['physical_index']
                    break

            # Find next known physical_index
            next_physical_index = end_of_document
            for j in range(i + 1, len(toc_items)):
                if toc_items[j].get('physical_index') is not None:
                    next_physical_index = toc_items[j]['physical_index']
                    break

            # Search between prev and next for this title
            content_range = pages[prev_physical_index:next_physical_index]
            result = add_page_number_to_toc(content_range, item, model)
            item['physical_index'] = result['physical_index']
```

**Example:**
```
Before offset:                      After offset:
─────────────                       ────────────
page: 1  →  physical_index: 5
page: 3  →  physical_index: 7
page: 10 →  physical_index: 14
```

### Step 6.5: Validate Physical Indices

**Purpose:** Remove TOC entries that reference pages beyond document length

Before verification, the system validates that physical indices don't exceed the actual document:

```python
def validate_and_truncate_physical_indices(toc_with_page_number, page_list_length, start_index=1):
    max_allowed_page = page_list_length + start_index - 1

    for item in toc_with_page_number:
        if item.get('physical_index') is not None:
            if item['physical_index'] > max_allowed_page:
                item['physical_index'] = None  # Remove invalid index
                logger.info(f"Removed physical_index for '{item['title']}' (was beyond document)")
```

**Why this is needed:**
- PDF might be truncated/corrupted
- TOC might reference appendices that aren't in the file
- Prevents IndexError during later processing

### Step 6.6: Verification & Fix

**Purpose:** Verify mapped indices are correct and fix errors

After mapping, the system **verifies** each entry is actually correct:

**1. Sample verification:**
```python
# For each TOC entry, check if title appears at that physical page
accuracy, incorrect_results = await verify_toc(page_list, toc_with_page_number)
```

**LLM Prompt (for each entry):**
```
Check if the given section appears or starts in the given page_text.

Section title: "Executive Summary"
Page text: {content of page 5}

Return JSON:
{
  "thinking": "<reasoning>",
  "answer": "yes" or "no"
}
```

**2. If accuracy > 60% but some are wrong, fix them:**
```python
if accuracy > 0.6 and len(incorrect_results) > 0:
    toc = await fix_incorrect_toc_with_retries(toc, page_list, incorrect_results)
```

**3. Fix process:**
- For each incorrect entry, search between previous and next correct entries
- Ask LLM to find correct physical index
- Retry up to 3 times

**4. Fallback chain (if accuracy ≤ 60%):**
```
process_toc_with_page_numbers (failed)
        ↓
process_toc_no_page_numbers (ignore page numbers, search document)
        ↓
process_no_toc (generate structure from content)
```

This is handled by `meta_processor()` which recursively tries simpler modes:
```python
async def meta_processor(page_list, mode, toc_content, ...):
    # ... process based on mode ...

    accuracy, incorrect_results = await verify_toc(...)

    if accuracy > 0.6 and len(incorrect_results) > 0:
        # Fix incorrect items
        toc = await fix_incorrect_toc_with_retries(...)
        return toc
    else:
        # Fallback to simpler mode
        if mode == 'process_toc_with_page_numbers':
            return await meta_processor(..., mode='process_toc_no_page_numbers')
        elif mode == 'process_toc_no_page_numbers':
            return await meta_processor(..., mode='process_no_toc')
        else:
            raise Exception('Processing failed')
```

### Step 6.7: Add Preface (if needed)

**Purpose:** Add a "Preface" node if content exists before the first TOC section

If the first TOC entry starts after page 1 (e.g., cover page, title page), automatically add a Preface node:

```python
def add_preface_if_needed(data):
    if data[0]['physical_index'] is not None and data[0]['physical_index'] > 1:
        preface_node = {
            "structure": "0",
            "title": "Preface",
            "physical_index": 1,
        }
        data.insert(0, preface_node)
    return data
```

**Example:**
```
Before:                              After:
─────────                            ──────
1. Introduction (page 5)             0. Preface (page 1)     ← Auto-added
2. Methods (page 10)                 1. Introduction (page 5)
3. Results (page 15)                 2. Methods (page 10)
                                     3. Results (page 15)
```

### Step 6.8: Check Title Appearance at Start

**Purpose:** Determine if section title appears at the START of its page (affects end_index calculation)

```python
async def check_title_appearance_in_start_concurrent(structure, page_list, model):
    for item in structure:
        page_text = page_list[item['physical_index'] - 1][0]
        result = await check_title_appearance_in_start(item['title'], page_text, model)
        item['appear_start'] = result  # "yes" or "no"
```

**Why this matters:**

If a section starts at the BEGINNING of a page, the previous section ends on the page BEFORE:
```
Section A ends at page 9 (Section B starts at beginning of page 10)
```

If a section starts in the MIDDLE of a page, the previous section ends on the SAME page:
```
Section A ends at page 10 (Section B starts in middle of page 10)
```

This is used in `post_processing()`:
```python
for i, item in enumerate(structure):
    if i < len(structure) - 1:
        if structure[i + 1].get('appear_start') == 'yes':
            item['end_index'] = structure[i + 1]['physical_index'] - 1  # Page before
        else:
            item['end_index'] = structure[i + 1]['physical_index']      # Same page
```

### Step 7: Build Hierarchical Tree

**Purpose:** Convert flat list into nested tree structure with parent-child relationships and page ranges

After "Transform to JSON" and "Map to Physical Pages", we have a **flat list**. But documents have nested structure (sections contain subsections). This step converts the flat list into a **nested tree**.

**Input (flat list):**
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

**Problems with flat list:**
- No parent-child relationships
- Don't know where each section **ends**
- Can't navigate hierarchically

**Output (hierarchical tree):**
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

**What this step does:**

**1. Determines Parent-Child Relationships**

Based on `structure` field:
```
1. Executive Summary          ← parent
   1.1 Financial Overview     ← child of 1
   1.2 Risk Assessment        ← child of 1
2. Detailed Analysis          ← parent
   2.1 Market Trends          ← child of 2
3. Conclusion                 ← parent (no children)
```

**2. Calculates `endIndex` for Each Section**

A section **ends** where the next sibling or parent's next sibling **starts**:
```
Section 1 starts at page 5
Section 2 starts at page 15
→ Section 1 ends at page 14 (one before Section 2)

Section 1.1 starts at page 7
Section 1.2 starts at page 10
→ Section 1.1 ends at page 9 (one before 1.2)
```

**3. Nests Children Under Parents**
```
Before:  [1, 1.1, 1.2, 2, 2.1, 3]  (flat)

After:   [
           1 → [1.1, 1.2],
           2 → [2.1],
           3
         ]                         (nested)
```

**Visual transformation:**
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

**Why this matters for RAG:**

With hierarchical tree, LLM can reason:

> "User asks about risk. Let me check... 'Risk Assessment' is under 'Executive Summary'. I should look at pages 10-14."

Instead of searching all pages, it navigates the tree structure like a human would.

### Step 8: Split Large Nodes (Recursive)

**Purpose:** Split nodes that are too large (exceed token/page limits) into smaller sub-sections

After building the tree, some sections might be **too large** (too many pages or tokens). This step **recursively splits** them into smaller sub-sections.

**Why split large nodes?**

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

**How it works:**

**1. Check if node is too large:**
```
If node has:
  - More than 10 pages (default: maxPageNumEachNode)
  - AND more than 20,000 tokens (default: maxTokenNumEachNode)
→ Split it
```

**2. Generate sub-structure from content:**

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

**3. Create child nodes:**
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

**4. Recursive - repeat until all nodes are small enough:**

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

**Visual transformation:**
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

**The splitting process (same as No-TOC path):**

When splitting, it uses the **same process** as when no TOC is found:
1. Take content from `startIndex` to `endIndex`
2. Add `<physical_index_X>` tags to mark page boundaries
3. Ask LLM to identify section headings
4. Build sub-tree from LLM response

**Configuration:**
```
maxPageNumEachNode: 10      // Split if more than 10 pages
maxTokenNumEachNode: 20000  // AND more than 20k tokens
```

Both conditions must be true to trigger split (pages AND tokens).

**Why this matters:**

| Without Split | With Split |
|---------------|------------|
| 65-page section | Multiple 10-15 page sections |
| Can't fit in LLM context | Each section fits in context |
| Coarse retrieval | Fine-grained retrieval |
| "Look at pages 15-80" | "Look at pages 40-48 (Direct Competitors)" |

### Step 9: Add Summaries (Optional)

**Purpose:** Generate LLM summaries for each node to improve retrieval accuracy

**Process:**

**1. Add text content to each node:**
```python
add_node_text(structure, page_list)
# Each node gets: node['text'] = content from startIndex to endIndex
```

**2. Flatten tree to list (top-down order):**
```python
def structure_to_list(structure):
    nodes = []
    nodes.append(structure)        # Add current node
    if 'nodes' in structure:
        nodes.extend(structure_to_list(structure['nodes']))  # Then children
    return nodes
```

Order: Parent → Children → Grandchildren
```
Tree:                    List:
A                        [A, B, D, E, C, F]
├── B
│   ├── D
│   └── E
└── C
    └── F
```

**3. Generate ALL summaries in PARALLEL:**
```python
async def generate_summaries_for_structure(structure, model):
    nodes = structure_to_list(structure)

    # All nodes processed simultaneously
    tasks = [generate_node_summary(node, model) for node in nodes]
    summaries = await asyncio.gather(*tasks)

    for node, summary in zip(nodes, summaries):
        node['summary'] = summary
```

**4. LLM Prompt for each node:**
```
You are given a part of a document, your task is to generate a description
about what are main points covered in the partial document.

Partial Document Text: {node['text']}

Directly return the description.
```

**5. Remove text after summaries (optional):**
```python
if opt.if_add_node_text == 'no':
    remove_structure_text(structure)  # Keep summaries, remove raw text
```

**6. Generate document description (optional):**
```python
if opt.if_add_doc_description == 'yes':
    doc_description = generate_doc_description(clean_structure, model)
```

**Key points:**
- **All levels** get summaries (root, middle, leaves)
- **Parallel execution** - all nodes processed simultaneously
- **Independent** - each summary based only on that node's text, not children's summaries

**Before (no summaries):**
```json
{
  "title": "Risk Assessment",
  "startIndex": 10,
  "endIndex": 14
}
```

**After (with summaries):**
```json
{
  "title": "Risk Assessment",
  "startIndex": 10,
  "endIndex": 14,
  "summary": "Analyzes key risks including market volatility, regulatory changes, and supply chain disruptions. Includes mitigation strategies."
}
```

**Why summaries help RAG:**

| Without Summaries | With Summaries |
|-------------------|----------------|
| LLM only sees title | LLM sees what section actually covers |
| Guesses based on title | Knows exact content |
| "Risk Assessment" - what kind of risk? | "...supply chain disruptions..." - exact match! |

**Configuration:**
```
addNodeSummary: true       // Generate summaries for each node
addDocDescription: true    // Generate overall document description
```

### Step 10: Output JSON Tree (Final Step)

**Purpose:** Final assembly - add node IDs, package into JSON, and save to file

**Process:**

**1. Add Node IDs (optional):**
```python
if opt.if_add_node_id == 'yes':
    write_node_id(structure)
```

Assigns unique IDs in **top-down order**:
```python
def write_node_id(data, node_id=0):
    data['node_id'] = str(node_id).zfill(4)  # "0000", "0001", etc.
    node_id += 1
    for child in data.get('nodes', []):
        node_id = write_node_id(child, node_id)
    return node_id
```

```
Before:                          After:
Executive Summary                Executive Summary (node_id: "0000")
├── Financial Overview           ├── Financial Overview (node_id: "0001")
├── Risk Assessment              ├── Risk Assessment (node_id: "0002")
Detailed Analysis                Detailed Analysis (node_id: "0003")
└── Market Trends                └── Market Trends (node_id: "0004")
```

**2. Package into Final JSON:**
```python
return {
    'doc_name': get_pdf_name(doc),           # "annual-report-2023.pdf"
    'doc_description': doc_description,       # Optional (from Step 9)
    'structure': structure,                   # The hierarchical tree
}
```

**3. Save to File:**
```python
output_file = f'./results/{pdf_name}_structure.json'
with open(output_file, 'w') as f:
    json.dump(result, f, indent=2)
```

**Final Output Example:**
```json
{
  "doc_name": "annual-report-2023.pdf",
  "doc_description": "2023 Annual Report covering financial performance and market analysis.",
  "structure": [
    {
      "title": "Executive Summary",
      "start_index": 1,
      "end_index": 14,
      "node_id": "0000",
      "summary": "Overview of 2023 financial performance...",
      "nodes": [
        {
          "title": "Financial Overview",
          "start_index": 5,
          "end_index": 7,
          "node_id": "0001",
          "summary": "Revenue grew 15% YoY..."
        },
        {
          "title": "Risk Assessment",
          "start_index": 8,
          "end_index": 14,
          "node_id": "0002",
          "summary": "Key risks include market volatility..."
        }
      ]
    },
    {
      "title": "Detailed Analysis",
      "start_index": 15,
      "end_index": 50,
      "node_id": "0003",
      "summary": "In-depth market and competitor analysis..."
    }
  ]
}
```

**Summary:**

| Action | What It Does |
|--------|--------------|
| Add Node IDs | Unique IDs ("0000", "0001"...) for each node |
| Package JSON | Wrap with `doc_name`, `doc_description`, `structure` |
| Save to File | Write to `./results/{pdf_name}_structure.json` |

---

## Fallback: No TOC Found

When PDF has no Table of Contents, generate structure from content:

**Process:**
1. Split document into chunks (~20k tokens each)
2. For first chunk: Ask LLM to identify section headings
3. For subsequent chunks: Continue building the structure
4. LLM identifies sections by:
   - Numbered headings (1., 1.1, 2.)
   - Capitalized titles
   - Content structure patterns

**LLM Prompt (initial):**
```
You are an expert in extracting hierarchical tree structure.
Generate the tree structure of the document.

The text contains tags like <physical_index_X> to mark page boundaries.

Response format:
[
  { "structure": "1", "title": "Introduction", "physical_index": "<physical_index_1>" },
  { "structure": "1.1", "title": "Background", "physical_index": "<physical_index_3>" }
]
```

---

## Summary: Two Paths

```
                         ┌──────────────┐
                         │   PDF Input  │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  Detect TOC  │
                         └──────┬───────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
          ┌──────▼──────┐               ┌──────▼──────┐
          │  TOC Found  │               │  No TOC     │
          └──────┬──────┘               └──────┬──────┘
                 │                             │
          ┌──────▼──────┐               ┌──────▼──────┐
          │ Extract &   │               │ Scan entire │
          │ Parse TOC   │               │ document    │
          │ (Fast)      │               │ (Slow)      │
          └──────┬──────┘               └──────┬──────┘
                 │                             │
                 └──────────────┬──────────────┘
                                │
                         ┌──────▼───────┐
                         │ Hierarchical │
                         │ Tree Output  │
                         └──────────────┘
```

---

## Output Format

```json
{
  "docName": "annual-report-2023.pdf",
  "docDescription": "2023 financial report covering...",
  "structure": [
    {
      "title": "Executive Summary",
      "startIndex": 1,
      "endIndex": 14,
      "nodeId": "0000",
      "summary": "Overview of financial performance...",
      "nodes": [
        {
          "title": "Financial Overview",
          "startIndex": 5,
          "endIndex": 7,
          "nodeId": "0001"
        },
        {
          "title": "Risk Assessment",
          "startIndex": 8,
          "endIndex": 14,
          "nodeId": "0002"
        }
      ]
    },
    {
      "title": "Detailed Analysis",
      "startIndex": 15,
      "endIndex": 50,
      "nodeId": "0003"
    }
  ]
}
```

---

---

## Edge Cases & Special Handling

### 1. Fuzzy Title Matching

All title verification prompts explicitly tell LLM to use fuzzy matching:
```
Note: do fuzzy matching, ignore any space inconsistency in the page_text.
```

This handles cases where:
- PDF extraction adds extra spaces
- Section titles have inconsistent formatting
- Minor OCR errors in scanned documents

### 2. Input Type Validation

PageIndex supports both file paths and in-memory BytesIO objects:
```python
is_valid_pdf = (
    (isinstance(doc, str) and os.path.isfile(doc) and doc.lower().endswith(".pdf")) or
    isinstance(doc, BytesIO)
)
if not is_valid_pdf:
    raise ValueError("Unsupported input type. Expected a PDF file path or BytesIO object.")
```

### 3. PDF Parser Options

Two PDF parsing backends are supported (in `get_page_tokens`):
- **PyPDF2** (default): Standard Python PDF library
- **PyMuPDF**: Faster, better for complex PDFs

### 4. Chunk Overlap for Large Documents

When splitting document into chunks for processing, 1 page overlap is used to ensure section boundaries aren't missed:
```python
def page_list_to_group_text(page_contents, token_lengths, max_tokens=20000, overlap_page=1):
    # ...
    overlap_start = max(i - overlap_page, 0)
    current_subset = page_contents[overlap_start:i]  # Include overlap
```

### 5. Early Return in Verification

If the last TOC entry's physical index is in the first half of the document, verification returns 0% accuracy immediately (assumes something is wrong):
```python
async def verify_toc(page_list, list_result, ...):
    # Find the last non-None physical_index
    last_physical_index = ...

    # Early return if indices don't cover enough of document
    if last_physical_index is None or last_physical_index < len(page_list)/2:
        return 0, []  # Accuracy 0, triggers fallback
```

### 6. Sampling Verification (Optional)

Verification can check only N random samples instead of all items:
```python
async def verify_toc(page_list, list_result, start_index=1, N=None, model=None):
    if N is None:
        sample_indices = range(0, len(list_result))  # Check all
    else:
        N = min(N, len(list_result))
        sample_indices = random.sample(range(0, len(list_result)), N)  # Random sample
```

### 7. Duplicate Title Handling in Split

When splitting a large node, if the first generated sub-section has the SAME title as the parent, it's excluded to avoid duplication:
```python
if valid_node_toc_items and node['title'].strip() == valid_node_toc_items[0]['title'].strip():
    # First child has same title as parent - skip it
    node['nodes'] = post_processing(valid_node_toc_items[1:], node['end_index'])
else:
    node['nodes'] = post_processing(valid_node_toc_items, node['end_index'])
```

### 8. Default Values for Missing LLM Keys

When LLM response doesn't contain expected keys, safe defaults are used:
```python
# In check_title_appearance
if 'answer' in response:
    answer = response['answer']
else:
    answer = 'no'  # Default to 'no' if key missing

# In check_title_appearance_in_start
return response.get("start_begin", "no")  # Default to 'no'
```

### 9. Exception Handling in Concurrent Operations

Async operations catch and log exceptions without crashing:
```python
results = await asyncio.gather(*tasks, return_exceptions=True)
for item, result in zip(valid_items, results):
    if isinstance(result, Exception):
        logger.error(f"Error checking start for {item['title']}: {result}")
        item['appear_start'] = 'no'  # Safe default
    else:
        item['appear_start'] = result
```

### 10. Filter None Physical Index Items

Before processing steps, items with None physical_index are filtered:
```python
# In meta_processor
toc_with_page_number = [item for item in toc_with_page_number if item.get('physical_index') is not None]

# In tree_parser
valid_toc_items = [item for item in toc_with_page_number if item.get('physical_index') is not None]

# In process_large_node_recursively
valid_node_toc_items = [item for item in node_toc_tree if item.get('physical_index') is not None]
```

### 11. TOC Content Whitespace Check

TOC content must be non-empty AND not just whitespace:
```python
if check_toc_result.get("toc_content") and check_toc_result["toc_content"].strip() and ...:
    # Process with TOC
else:
    # Fall back to no-TOC processing
```

### 12. Bounds Checking Throughout

Multiple functions include bounds checking to prevent IndexError:
```python
# In process_none_page_numbers
list_index = page_index - start_index
if list_index >= 0 and list_index < len(page_list):
    # Safe to access
else:
    continue  # Skip

# In fix_incorrect_toc
if list_index < 0 or list_index >= len(toc_with_page_number):
    return { 'is_valid': False }  # Invalid index
```

### 13. Empty Token Count Handling

Returns 0 for empty/None text:
```python
def count_tokens(text, model=None):
    if not text:
        return 0
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))
```

### 14. JSON Extraction with Fallbacks

Multiple fallback attempts for parsing LLM JSON responses:
```python
def extract_json(content):
    try:
        # Try to extract from ```json blocks
        # Clean up common issues (None → null, newlines, whitespace)
        return json.loads(json_content)
    except json.JSONDecodeError:
        try:
            # Remove trailing commas and retry
            json_content = json_content.replace(',]', ']').replace(',}', '}')
            return json.loads(json_content)
        except:
            return {}  # Empty dict as last resort
    except Exception:
        return {}
```

### 15. Physical Index Format Conversion

Handles multiple physical_index string formats:
```python
def convert_physical_index_to_int(data):
    if isinstance(data, str):
        if data.startswith('<physical_index_'):      # <physical_index_5>
            data = int(data.split('_')[-1].rstrip('>').strip())
        elif data.startswith('physical_index_'):     # physical_index_5
            data = int(data.split('_')[-1].strip())
        if isinstance(data, int):
            return data
        else:
            return None  # Conversion failed
```

### 16. Page Number Conversion with Safe Fallback

Keeps original value if conversion fails:
```python
def convert_page_to_int(data):
    for item in data:
        if 'page' in item and isinstance(item['page'], str):
            try:
                item['page'] = int(item['page'])
            except ValueError:
                pass  # Keep original string value
```

### 17. Tree Conversion Fallback

If tree conversion fails, returns cleaned flat list:
```python
def post_processing(structure, end_physical_index):
    # ... calculate start_index and end_index ...
    tree = list_to_tree(structure)
    if len(tree) != 0:
        return tree
    else:
        # Tree conversion failed, return flat list instead
        for node in structure:
            node.pop('appear_start', None)
            node.pop('physical_index', None)
        return structure
```

### 18. Filename Sanitization

Removes invalid characters from filenames:
```python
def sanitize_filename(filename, replacement='-'):
    # In Linux, only '/' and '\0' are invalid
    return filename.replace('/', replacement)
```

### 19. Config Validation

Validates user-provided config keys:
```python
def _validate_keys(self, user_dict):
    unknown_keys = set(user_dict) - set(self._default_dict)
    if unknown_keys:
        raise ValueError(f"Unknown config keys: {unknown_keys}")
```

### 20. JSON Truncation for Incomplete Responses

When LLM output is cut off mid-JSON, truncates at last valid `}`:
```python
position = last_complete.rfind('}')
if position != -1:
    last_complete = last_complete[:position+2]  # Keep valid portion
```

### 21. Markdown Code Block Handling

Handles when LLM wraps continuation in markdown:
```python
if new_complete.startswith('```json'):
    new_complete = get_json_content(new_complete)
    last_complete = last_complete + new_complete
```

### 22. TOC Detection Beyond Max Pages

Continues scanning beyond `toc_check_page_num` if actively finding TOC pages:
```python
while i < len(page_list):
    # Only stop if we're past max AND not currently finding TOC
    if i >= opt.toc_check_page_num and not last_page_is_yes:
        break
```

### 23. Offset Calculation Null Safety

Returns None if no valid pairs found:
```python
def calculate_page_offset(pairs):
    differences = []
    for pair in pairs:
        try:
            difference = pair['physical_index'] - pair['page']
            differences.append(difference)
        except (KeyError, TypeError):
            continue  # Skip invalid pairs

    if not differences:
        return None  # No valid data to calculate offset
```

### 24. Smart Chunk Sizing

Uses averaged chunk size for balanced distribution:
```python
expected_parts_num = math.ceil(num_tokens / max_tokens)
average_tokens_per_part = math.ceil(((num_tokens / expected_parts_num) + max_tokens) / 2)
```

### 25. Single Chunk Optimization

Skips chunking if document fits in one chunk:
```python
if num_tokens <= max_tokens:
    page_text = "".join(page_contents)
    return [page_text]  # No need to split
```

### 26. Finish Reason Validation

Raises exception if LLM didn't complete normally:
```python
if finish_reason == 'finished':
    return extract_json(response)
else:
    raise Exception(f'finish reason: {finish_reason}')
```

### 27. Division by Zero Protection

Safe accuracy calculation:
```python
accuracy = correct_count / checked_count if checked_count > 0 else 0
```

### 28. Perfect Accuracy Short-Circuit

Returns immediately if 100% accuracy (no fixing needed):
```python
if accuracy == 1.0 and len(incorrect_results) == 0:
    return toc_with_page_number  # Skip fix step
```

### 29. Empty Node List Safety

Safe fallback when splitting produces no valid items:
```python
node['end_index'] = valid_node_toc_items[0]['start_index'] if valid_node_toc_items else node['end_index']
```

### 30. Temporary Text for Summary Generation

Text is added temporarily for summary, then removed:
```python
if opt.if_add_node_summary == 'yes':
    if opt.if_add_node_text == 'no':
        add_node_text(structure, page_list)      # Temporarily add
    await generate_summaries_for_structure(...)
    if opt.if_add_node_text == 'no':
        remove_structure_text(structure)          # Remove after
```

### 31. Physical Index Minimum Validation

Only uses physical indices >= start_page_index:
```python
if physical_index is not None and int(physical_index) >= start_page_index:
    pairs.append(...)
```

### 32. Fix Loop with Two Exit Conditions

Continues fixing until ALL fixed OR max attempts:
```python
while current_incorrect:  # Still have incorrect items
    current_toc, current_incorrect = await fix_incorrect_toc(...)
    fix_attempt += 1
    if fix_attempt >= max_attempts:
        logger.info("Maximum fix attempts reached")
        break  # Give up after 3 tries
```

### 33. Orphan Node Handling in Tree Building

If a node's parent structure doesn't exist, it becomes a root node:
```python
def list_to_tree(data):
    for item in data:
        parent_structure = get_parent_structure(structure)  # e.g., "1" for "1.1"

        if parent_structure:
            if parent_structure in nodes:
                nodes[parent_structure]['nodes'].append(node)  # Normal case
            else:
                root_nodes.append(node)  # Parent not found = treat as root
        else:
            root_nodes.append(node)  # No parent = root node
```

**Example:** If structure "2.1" exists but "2" was filtered out, "2.1" becomes a root node.

### 34. TOC Without Page Numbers → Direct to No-TOC Mode

**Important Flow Detail:** When TOC is found but has NO page numbers, it goes DIRECTLY to `process_no_toc`, NOT to `process_toc_no_page_numbers`:

```python
# In tree_parser
if toc_content AND toc_content.strip() AND page_index_given_in_toc == "yes":
    mode = 'process_toc_with_page_numbers'
else:
    mode = 'process_no_toc'  # Skips process_toc_no_page_numbers!
```

`process_toc_no_page_numbers` is ONLY used as a fallback when `process_toc_with_page_numbers` fails (accuracy ≤ 60%).

### 35. Multiple TOC Search Limit

The search for additional TOCs (when first TOC has no page numbers) is limited:
```python
while (toc_json['page_index_given_in_toc'] == 'no' and
       current_start_index < len(page_list) and
       current_start_index < opt.toc_check_page_num):  # ← This limit!
```

Search stops at `toc_check_page_num` (default 20) pages.

### 36. Unused/Reserved Functions

These functions are defined but NOT used in the main flow (reserved for future use):
- `extract_toc_content()` - LLM-based TOC extraction (currently regex is used)
- `check_if_toc_extraction_is_complete()` - Validates TOC completeness
- `remove_first_physical_index_section()` - Removes first page section

### 37. Parent Structure Parsing

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

---

## Error Handling & Retry Logic

### API Retry Mechanism

All LLM API calls have built-in retry logic:

```python
def ChatGPT_API(model, prompt, api_key):
    max_retries = 10
    for i in range(max_retries):
        try:
            response = client.chat.completions.create(...)
            return response.choices[0].message.content
        except Exception as e:
            logging.error(f"Error: {e}")
            if i < max_retries - 1:
                time.sleep(1)  # Wait 1 second before retry
            else:
                logging.error('Max retries reached')
                return "Error"
```

**Async version** uses `await asyncio.sleep(1)` for non-blocking retries.

### Multiple TOC Search

If the first TOC found has no page numbers, the system searches for additional TOCs:

```python
def check_toc(page_list, opt):
    toc_page_list = find_toc_pages(start_page_index=0, page_list, opt)

    if len(toc_page_list) == 0:
        return {'toc_content': None, 'page_index_given_in_toc': 'no'}

    toc_json = toc_extractor(page_list, toc_page_list, opt.model)

    if toc_json['page_index_given_in_toc'] == 'yes':
        return toc_json

    # TOC found but no page numbers - search for more TOCs
    current_start_index = toc_page_list[-1] + 1

    while toc_json['page_index_given_in_toc'] == 'no':
        additional_toc_pages = find_toc_pages(start_page_index=current_start_index, ...)

        if len(additional_toc_pages) == 0:
            break

        additional_toc = toc_extractor(page_list, additional_toc_pages, ...)
        if additional_toc['page_index_given_in_toc'] == 'yes':
            return additional_toc  # Found TOC with page numbers!

        current_start_index = additional_toc_pages[-1] + 1
```

**Why this is needed:**
- Some documents have multiple TOCs (e.g., brief TOC + detailed TOC)
- Brief TOC might not have page numbers, detailed TOC does
- System keeps searching until it finds a TOC with page numbers or exhausts options

---

## Configuration System

PageIndex uses a YAML-based configuration system with defaults:

```python
class ConfigLoader:
    def __init__(self, default_path="config.yaml"):
        self._default_dict = self._load_yaml(default_path)

    def load(self, user_opt=None):
        # Merge user options with defaults
        merged = {**self._default_dict, **user_opt}
        return config(**merged)
```

**Configuration Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `gpt-4o-2024-11-20` | LLM model to use |
| `toc_check_page_num` | 20 | Max pages to scan for TOC |
| `max_page_num_each_node` | 10 | Split threshold (pages) |
| `max_token_num_each_node` | 20000 | Split threshold (tokens) |
| `if_add_node_id` | `yes` | Add unique IDs to nodes |
| `if_add_node_summary` | `yes` | Generate summaries |
| `if_add_doc_description` | `no` | Generate document description |
| `if_add_node_text` | `no` | Keep raw text in output |

**Usage:**
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

---

## Logging System

PageIndex uses a JSON-based logger that records all processing steps:

```python
class JsonLogger:
    def __init__(self, file_path):
        pdf_name = get_pdf_name(file_path)
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.filename = f"{pdf_name}_{current_time}.json"
        os.makedirs("./logs", exist_ok=True)
        self.log_data = []

    def info(self, message):
        self.log_data.append(message)
        with open(self._filepath(), "w") as f:
            json.dump(self.log_data, f, indent=2)
```

**Log output location:** `./logs/{pdf_name}_{timestamp}.json`

**What's logged:**
- Total page count and token count
- TOC detection results
- Transformation results at each step
- Verification accuracy and incorrect results
- Fix attempts and outcomes

---

## Phase 2: Query-Time Retrieval

At query time, use LLM reasoning to navigate the tree:

1. Present tree structure to LLM
2. Ask: "Which sections are relevant to answer this question?"
3. LLM reasons through the hierarchy
4. Returns relevant page ranges
5. Fetch and use those pages for final answer

**Advantage over vector search:**
- Explainable (LLM shows reasoning)
- Maintains document structure
- True relevance, not just similarity
