# Pipeline Overview

## Index Generation Pipeline

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

## Two Processing Paths

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

## Detailed Flow with All Branches

```
INPUT: PDF
    │
    ▼
[Step 1] PDF Extraction
    │
    ▼
[Step 2] TOC Detection (scan first 20 pages)
    │
    ├─── TOC Found + Has Page Numbers ────────────┐
    │                                              │
    ├─── TOC Found + NO Page Numbers ───► process_no_toc
    │                                              │
    └─── No TOC Found ────────────────► process_no_toc
                                                   │
[Step 3-6] TOC Processing Path                     │
    │                                              │
    ▼                                              │
[Step 6.6] Verify TOC                              │
    │                                              │
    ├─── Accuracy > 60% + Has Errors ──► Fix Errors (max 3 retries)
    │                                              │
    ├─── Accuracy > 60% + No Errors ──► Continue   │
    │                                              │
    └─── Accuracy ≤ 60% ──────────────► process_toc_no_page_numbers
                                            │
                                            ├─── Accuracy > 60% ──► Continue
                                            │
                                            └─── Accuracy ≤ 60% ──► process_no_toc
                                                                        │
    ◄──────────────────────────────────────────────────────────────────┘
    │
    ▼
[Step 7] Build Hierarchical Tree
    │
    ▼
[Step 8] Split Large Nodes (recursive)
    │
    ▼
[Step 9] Add Summaries (parallel)
    │
    ▼
[Step 10] Output JSON
    │
    ▼
OUTPUT: JSON Tree Structure
```

## Step Details

See individual step documentation in `steps/` folder:

| Step | File | Purpose |
|------|------|---------|
| 1 | [01-pdf-extraction.md](steps/01-pdf-extraction.md) | Extract text and tokens from PDF |
| 2 | [02-toc-detection.md](steps/02-toc-detection.md) | Find TOC pages using LLM |
| 3 | [03-toc-content-extraction.md](steps/03-toc-content-extraction.md) | Clean and concatenate TOC pages |
| 4 | [04-page-number-detection.md](steps/04-page-number-detection.md) | Check if TOC has page numbers |
| 5 | [05-toc-transformation.md](steps/05-toc-transformation.md) | Convert TOC text to JSON |
| 6 | [06-physical-page-mapping.md](steps/06-physical-page-mapping.md) | Map logical to physical pages |
| 7 | [07-build-hierarchical-tree.md](steps/07-build-hierarchical-tree.md) | Create nested tree structure |
| 8 | [08-split-large-nodes.md](steps/08-split-large-nodes.md) | Split oversized nodes |
| 9 | [09-add-summaries.md](steps/09-add-summaries.md) | Generate node summaries |
| 10 | [10-output-json-tree.md](steps/10-output-json-tree.md) | Final JSON output |
