# Image Solution: Concept & Architecture

Combining Sotaagents-enhance image handling with PageIndex pipeline.

---

## Current State

### PageIndex (Text Only)
- Extracts text using PyPDF2/PyMuPDF
- Images, charts, infographics are ignored
- Scanned PDFs fail (no OCR)

### Sotaagents-enhance (Full Visual)
- Detects embedded images via MuPDF StructuredText
- Fallback: Convert page to image → LLM bounding box detection → crop
- Describes images with Gemini Vision
- Uploads to S3/Vercel Blob
- Appends descriptions back to content

---

## Proposed Combined Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     ENHANCED PAGEINDEX PIPELINE                  │
└─────────────────────────────────────────────────────────────────┘

STEP 1: PDF Extraction (Existing)
    │
    │  Extract text programmatically (PyPDF2/PyMuPDF)
    │  Output: page_list = [(text, token_count), ...]
    │
    ▼
STEP 1.5: Visual Content Detection (NEW)
    │
    │  Question: Does this document have visual content?
    │
    ├─── Method A: Check for embedded images (MuPDF)
    │    - Fast, programmatic
    │    - Detects actual image objects in PDF
    │
    ├─── Method B: LLM visual detection (Fallback)
    │    - Convert page to image
    │    - Ask LLM: "Does this page have charts/diagrams/images?"
    │    - Get bounding boxes if yes
    │
    ▼
STEP 1.6: Image Extraction (NEW, if visuals detected)
    │
    ├─── Path A: Extract embedded images directly
    │    - Use MuPDF to extract actual image bytes
    │    - Maintains original quality
    │
    ├─── Path B: Page-to-image + Crop (Fallback)
    │    - Convert full page to PNG
    │    - Use LLM bounding boxes to crop regions
    │    - Use Sharp/Pillow for cropping
    │
    ▼
STEP 1.7: Image Description (NEW)
    │
    │  For each extracted image:
    │  - Send to Vision LLM (GPT-4V / Gemini Vision)
    │  - Get detailed description (all text, data points, labels)
    │  - Process all images concurrently for speed
    │
    ▼
STEP 1.8: Content Enrichment (NEW)
    │
    │  For each page with images:
    │  - Append "## Visual Content" section
    │  - Include image descriptions
    │  - Optionally include image URLs (if uploaded)
    │  - Update token counts
    │
    ▼
STEP 2: TOC Detection (Existing, now with enriched content)
    │
    │  Enriched text helps TOC detection understand visual sections
    │
    ▼
STEP 3-10: Rest of Pipeline (Existing)
    │
    │  All downstream steps benefit from visual content:
    │  - Summaries include image information
    │  - RAG retrieval finds visual-related queries
    │
    ▼
OUTPUT: JSON Tree with Visual-Enriched Content
```

---

## Visual Detection Decision Tree

```
                    ┌─────────────────────┐
                    │  enable_visual_     │
                    │  extraction = true? │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │ NO                              │ YES
              ▼                                 ▼
    ┌─────────────────┐              ┌─────────────────┐
    │ Skip to TOC     │              │ Check embedded  │
    │ Detection       │              │ images (MuPDF)  │
    └─────────────────┘              └────────┬────────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │ Found?            │
                                    └─────────┬─────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │ YES                           │ NO
                              ▼                               ▼
                    ┌─────────────────┐            ┌─────────────────┐
                    │ Extract         │            │ LLM Visual      │
                    │ Directly        │            │ Detection       │
                    └────────┬────────┘            └────────┬────────┘
                             │                              │
                             │                    ┌─────────┴─────────┐
                             │                    │ Has visuals?      │
                             │                    └─────────┬─────────┘
                             │                              │
                             │              ┌───────────────┴───────────────┐
                             │              │ YES                           │ NO
                             │              ▼                               ▼
                             │    ┌─────────────────┐            ┌─────────────────┐
                             │    │ Page-to-Image   │            │ No visual       │
                             │    │ + Crop          │            │ content         │
                             │    └────────┬────────┘            └─────────────────┘
                             │             │
                             └──────┬──────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ Describe with   │
                          │ Vision LLM      │
                          │ (Concurrent)    │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Enrich page     │
                          │ text content    │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Continue to     │
                          │ TOC Detection   │
                          └─────────────────┘
```

---

## Key Concepts

### 1. Embedded Image Detection (Preferred)

**What:** Use MuPDF StructuredText to find actual image objects embedded in PDF.

**Why preferred:**
- Fast (no LLM calls needed for detection)
- Extracts original image quality
- Gets accurate bounding boxes from PDF structure

**When it works:**
- Native PDFs with embedded images
- Charts/diagrams inserted as images

**When it fails:**
- Scanned documents (whole page is one image)
- Vector graphics rendered as paths

### 2. LLM Visual Detection (Fallback)

**What:** Convert page to image, ask Vision LLM to identify visual elements and their locations.

**Why fallback:**
- More expensive (LLM calls per page)
- Slower processing
- But works for any visual content

**LLM returns:**
```
{
  "has_visual_content": true,
  "visual_elements": [
    {
      "type": "chart",
      "bbox": {"top": 20, "left": 10, "width": 60, "height": 40},
      "hint": "bar chart showing revenue"
    }
  ]
}
```

### 3. Image Extraction Methods

| Method | Input | Output | Use When |
|--------|-------|--------|----------|
| **Direct extraction** | PDF + xref | Original image bytes | Embedded images found |
| **Page-to-image + Crop** | Full page PNG + bbox | Cropped region PNG | LLM detection fallback |

### 4. Image Description

**Goal:** Extract ALL information from visual content for RAG.

**Key principles:**
- No summarization - extract every data point
- Charts: all axis labels, every data point, legend
- Diagrams: every node, every connection, all text
- Tables: all headers, all cells
- Infographics: all statistics, all text, relationships

**Processing:** Concurrent for speed (5-10 images at once)

### 5. Content Enrichment

**Before enrichment:**
```
Page 5 text:
"The quarterly results are shown below.
Company performance exceeded expectations."
```

**After enrichment:**
```
Page 5 text:
"The quarterly results are shown below.
Company performance exceeded expectations.

---

## Visual Content

### chart_1
Bar chart titled "Quarterly Revenue 2024"
X-axis: Q1, Q2, Q3, Q4
Y-axis: Revenue in millions (0-100)
Data points: Q1: $45M, Q2: $52M, Q3: $61M, Q4: $78M
Legend: Blue bars = Actual, Gray line = Target
Trend: Consistent growth, exceeded target in Q3 and Q4"
```

---

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable_visual_extraction` | bool | false | Enable visual processing |
| `visual_detection_method` | string | "auto" | "embedded", "llm", or "auto" |
| `vision_model` | string | "gpt-4o" | Model for image description |
| `vision_provider` | string | "auto" | "openai", "gemini", or "auto" |
| `min_image_size` | int | 50 | Skip images smaller than this (px) |
| `image_description_concurrency` | int | 5 | Parallel image processing |
| `upload_images` | bool | false | Upload to cloud storage |
| `image_storage` | string | "local" | "s3", "vercel_blob", "local" |

---

## Cost Considerations

| Scenario | Extra Cost |
|----------|------------|
| No visual content | Zero (detection is fast) |
| Embedded images only | Image description tokens only |
| LLM detection needed | Page analysis + image description tokens |
| Many images | Scales with image count |

**Optimization:** Only process pages where visual content is detected.

---

## Impact on Downstream Steps

### TOC Detection
- Enriched text may help identify section boundaries
- Visual content sections become part of document structure

### Node Summaries
- Summaries now include visual information
- "This section contains a revenue chart showing..."

### RAG Retrieval
- Queries about charts/diagrams return relevant sections
- "What does the revenue chart show?" → finds enriched content

### Token Counts
- Pages with images have higher token counts
- May trigger more node splitting
- Consider: separate threshold for visual content?

---

## New Modules Needed

| Module | Purpose |
|--------|---------|
| `visual_detector` | Detect embedded images, check for visual content |
| `image_extractor` | Extract images, convert pages, crop regions |
| `vision_llm` | Vision LLM integration (GPT-4V, Gemini) |
| `content_enricher` | Append descriptions to page text |
| `image_storage` | Optional S3/Vercel Blob upload |

---

## Summary

The image solution adds 4 new steps (1.5-1.8) between PDF extraction and TOC detection:

1. **Detect** - Find visual content (programmatic first, LLM fallback)
2. **Extract** - Get image bytes (direct or crop)
3. **Describe** - Vision LLM description (concurrent)
4. **Enrich** - Append to page text

This preserves the existing pipeline while adding comprehensive visual content support.
