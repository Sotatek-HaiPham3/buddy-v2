# Fallback Modes

PageIndex has a robust fallback chain for handling different document types and processing failures.

## Fallback Chain

```
process_toc_with_page_numbers (fastest, most accurate)
        ↓ (if accuracy ≤ 60%)
process_toc_no_page_numbers (medium speed)
        ↓ (if accuracy ≤ 60%)
process_no_toc (slowest, scans entire document)
```

## Mode Selection Logic

```python
# In tree_parser
if toc_content AND toc_content.strip() AND page_index_given_in_toc == "yes":
    mode = 'process_toc_with_page_numbers'
else:
    mode = 'process_no_toc'  # Note: Skips process_toc_no_page_numbers initially
```

**Important:** `process_toc_no_page_numbers` is ONLY used as a fallback when `process_toc_with_page_numbers` fails, not when TOC lacks page numbers initially.

## Mode 1: process_toc_with_page_numbers

**When used:** TOC found AND has page numbers

**Process:**
1. Transform TOC text to JSON
2. Calculate page offset (logical → physical)
3. Apply offset to all entries
4. Verify accuracy
5. If accuracy > 60%, fix incorrect entries (up to 3 retries)
6. If accuracy ≤ 60%, fall back to Mode 2

## Mode 2: process_toc_no_page_numbers

**When used:** Mode 1 failed (accuracy ≤ 60%)

**Process:**
1. Use TOC structure but ignore page numbers
2. Search entire document for each section title
3. Find physical indices by scanning pages
4. Verify accuracy
5. If accuracy ≤ 60%, fall back to Mode 3

## Mode 3: process_no_toc

**When used:** No TOC found OR Mode 2 failed

**Process:**
1. Split document into chunks (~20k tokens each)
2. For first chunk: Ask LLM to identify section headings
3. For subsequent chunks: Continue building structure
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

## Meta Processor Implementation

```python
async def meta_processor(page_list, mode, toc_content, ...):
    # ... process based on mode ...

    accuracy, incorrect_results = await verify_toc(...)

    if accuracy > 0.6 and len(incorrect_results) > 0:
        # Fix incorrect items
        toc = await fix_incorrect_toc_with_retries(...)
        return toc
    elif accuracy > 0.6:
        # All correct, return as-is
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

## Accuracy Threshold

The 60% accuracy threshold determines fallback:

| Accuracy | Action |
|----------|--------|
| > 60% with errors | Fix errors (up to 3 retries) |
| > 60% no errors | Continue to next step |
| ≤ 60% | Fall back to simpler mode |
| = 100% | Skip fix step, continue |

## Performance Comparison

| Mode | Speed | Accuracy | Use Case |
|------|-------|----------|----------|
| TOC with page numbers | Fast | Highest | Well-formatted documents |
| TOC without page numbers | Medium | Good | Partial TOC documents |
| No TOC | Slow | Variable | Unstructured documents |
