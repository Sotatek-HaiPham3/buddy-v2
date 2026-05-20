# Image Solution: Visual Content Processing for PageIndex

This document describes how to integrate visual content handling from Sotaagents-enhance into the PageIndex pipeline.

## Problem Statement

The current PageIndex implementation only extracts text:
```python
page_text = page.extract_text()  # PyPDF2
page_text = page.get_text()      # PyMuPDF
```

**Issues:**
- Images, charts, infographics are completely ignored
- Image-heavy pages return empty/minimal content
- Scanned PDFs fail entirely (no OCR)
- Visual information is lost for RAG retrieval

## Proposed Solution: Hybrid Visual Processing

Integrate a visual content detection and extraction step **after** text extraction but **before** TOC detection.

```
CURRENT FLOW:                    ENHANCED FLOW:
─────────────                    ──────────────

Step 1: PDF Extraction           Step 1: PDF Extraction
    │                                │
    │                            Step 1.5: Visual Detection
    │                                │
    │                            Step 1.6: Image Extraction
    │                                │
    │                            Step 1.7: Image Description
    │                                │
    │                            Step 1.8: Content Enrichment
    │                                │
    ▼                                ▼
Step 2: TOC Detection            Step 2: TOC Detection
    │                                │
   ...                              ...
```

---

## Enhanced Pipeline Steps

### Step 1: PDF Extraction (Existing)

Extract text content from each page.

```python
page_list = []
for page in pdf:
    page_text = page.extract_text()
    token_count = count_tokens(page_text)
    page_list.append((page_text, token_count))
```

### Step 1.5: Visual Content Detection

**Purpose:** Determine if each page has visual content that wasn't captured in text extraction.

**Two Detection Methods:**

#### Method A: Embedded Image Detection (Fast, Preferred)

Use MuPDF StructuredText to detect actual embedded images:

```python
import pymupdf

def detect_embedded_images(pdf_path):
    """Detect embedded images using MuPDF StructuredText."""
    doc = pymupdf.open(pdf_path)
    page_images = {}

    for page_num, page in enumerate(doc):
        images = []
        stext = page.get_text("dict")  # Structured text

        for block in stext.get("blocks", []):
            if block.get("type") == 1:  # Image block
                images.append({
                    "bbox": block.get("bbox"),
                    "width": block.get("width"),
                    "height": block.get("height"),
                })

        if images:
            page_images[page_num] = images

    return page_images
```

#### Method B: LLM Visual Detection (Fallback)

If programmatic extraction fails or for scanned documents:

```python
async def detect_visual_content_with_llm(page_image_base64, model):
    """Use LLM to detect if page has visual elements."""
    prompt = """
    Analyze this document page image. Does it contain:
    - Charts or graphs
    - Diagrams or flowcharts
    - Infographics
    - Photos or illustrations
    - Tables with visual formatting

    Return JSON:
    {
        "has_visual_content": true/false,
        "visual_elements": [
            {
                "type": "chart|diagram|image|table|infographic",
                "bbox": {"top": 0-100, "left": 0-100, "width": 0-100, "height": 0-100},
                "description_hint": "brief hint of what this shows"
            }
        ]
    }
    """
    return await call_vision_llm(prompt, page_image_base64, model)
```

### Step 1.6: Image Extraction

**Purpose:** Extract detected images for description.

#### Path A: Programmatic Extraction (Embedded Images)

```python
def extract_embedded_image(page, image_info):
    """Extract embedded image from PDF page."""
    xref = image_info.get("xref")
    if xref:
        base_image = doc.extract_image(xref)
        return {
            "data": base_image["image"],  # Raw bytes
            "ext": base_image["ext"],     # png, jpeg, etc.
            "width": base_image["width"],
            "height": base_image["height"],
        }
    return None
```

#### Path B: Page-to-Image + Crop (Fallback)

For pages without extractable embedded images or scanned documents:

```python
def convert_page_to_image(page, scale=2.0):
    """Convert PDF page to image."""
    mat = pymupdf.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")

def crop_visual_element(page_image, bbox, padding=2):
    """Crop visual element from page image using bounding box."""
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(page_image))
    width, height = img.size

    # Convert percentage bbox to pixels
    left = int((bbox["left"] - padding) / 100 * width)
    top = int((bbox["top"] - padding) / 100 * height)
    right = int((bbox["left"] + bbox["width"] + padding) / 100 * width)
    bottom = int((bbox["top"] + bbox["height"] + padding) / 100 * height)

    # Clamp to valid bounds
    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)

    cropped = img.crop((left, top, right, bottom))

    buffer = io.BytesIO()
    cropped.save(buffer, format="PNG")
    return buffer.getvalue()
```

### Step 1.7: Image Description Generation

**Purpose:** Generate detailed descriptions for each extracted image.

```python
async def describe_image(image_bytes, model="gpt-4o"):
    """Generate detailed description of image using Vision LLM."""
    import base64

    image_base64 = base64.b64encode(image_bytes).decode()

    prompt = """
    Describe this visual element in exhaustive detail:

    FOR CHARTS/GRAPHS:
    - Exact title and axis labels
    - ALL data points with their values
    - Legend items and their colors
    - Trends and relationships shown

    FOR DIAGRAMS/FLOWCHARTS:
    - Every node with exact text
    - All connections and their directions
    - Decision branches and conditions
    - Start/end points

    FOR INFOGRAPHICS:
    - All text content and statistics
    - Icon meanings and relationships
    - Color coding significance

    FOR IMAGES/PHOTOS:
    - What is depicted
    - Relevant text or labels visible
    - Context and significance

    Be comprehensive. Extract EVERY piece of information visible.
    """

    response = await call_vision_llm(prompt, image_base64, model)
    return response
```

**Parallel Processing for Efficiency:**

```python
async def describe_all_images(images, model):
    """Process all images concurrently."""
    tasks = [describe_image(img["data"], model) for img in images]
    descriptions = await asyncio.gather(*tasks)
    return descriptions
```

### Step 1.8: Content Enrichment

**Purpose:** Append image descriptions back to page text.

```python
def enrich_page_content(page_text, image_descriptions):
    """Append image descriptions to page text."""
    if not image_descriptions:
        return page_text

    enriched = page_text + "\n\n---\n\n## Visual Content\n\n"

    for i, desc in enumerate(image_descriptions):
        enriched += f"### Image {i + 1}\n\n{desc}\n\n"

    return enriched
```

**Updated Page List Structure:**

```python
# Before (text only)
page_list = [(text, token_count), ...]

# After (enriched with image descriptions)
page_list = [
    (enriched_text, token_count, image_urls),  # image_urls optional
    ...
]
```

---

## Complete Integration Flow

```python
async def page_index_with_images(pdf_path, opt):
    """Enhanced page_index with visual content processing."""

    # Step 1: Extract text
    page_list = get_page_tokens(pdf_path, opt.model, opt.pdf_parser)

    # Step 1.5: Detect visual content
    if opt.enable_visual_extraction:
        embedded_images = detect_embedded_images(pdf_path)

        if embedded_images:
            # Step 1.6: Extract images (programmatic path)
            extracted_images = extract_all_embedded_images(pdf_path, embedded_images)
        else:
            # Fallback: Check with LLM if pages have visuals
            extracted_images = await detect_and_extract_with_llm(pdf_path, page_list, opt.model)

        if extracted_images:
            # Step 1.7: Describe images (parallel)
            descriptions = await describe_all_images(extracted_images, opt.vision_model)

            # Step 1.8: Enrich page content
            for page_num, page_images in extracted_images.items():
                page_text, token_count = page_list[page_num]
                page_descriptions = [d for d in descriptions if d["page"] == page_num]
                enriched_text = enrich_page_content(page_text, page_descriptions)
                new_token_count = count_tokens(enriched_text)
                page_list[page_num] = (enriched_text, new_token_count)

    # Continue with existing pipeline
    # Step 2: TOC Detection
    check_toc_result = check_toc(page_list, opt)

    # ... rest of pipeline
```

---

## Image Storage Integration

For production use, upload images to cloud storage:

```python
async def upload_image(image_bytes, document_id, page_num, image_id):
    """Upload image to S3 or Vercel Blob."""
    path = f"pageindex/{document_id}/page-{page_num}/{image_id}.png"

    if os.getenv("AWS_ACCESS_KEY_ID"):
        return await upload_to_s3(image_bytes, path)
    elif os.getenv("BLOB_READ_WRITE_TOKEN"):
        return await upload_to_vercel_blob(image_bytes, path)
    else:
        # Local fallback
        local_path = f"./images/{path}"
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(image_bytes)
        return local_path
```

---

## Configuration Options

Add new config options for visual processing:

```yaml
# config.yaml
model: "gpt-4o-2024-11-20"
vision_model: "gpt-4o"              # Model for image description
enable_visual_extraction: true      # Enable visual content processing
visual_detection_method: "auto"     # "embedded", "llm", or "auto"
image_description_concurrency: 10   # Parallel image processing
upload_images: false                # Upload to cloud storage
image_storage: "local"              # "s3", "vercel_blob", or "local"
```

---

## Decision Flow Diagram

```
                    ┌─────────────────────┐
                    │  PDF Extraction     │
                    │  (Text + Tokens)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Visual Extraction  │
                    │     Enabled?        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │ YES            │                │ NO
              ▼                │                ▼
    ┌─────────────────┐        │      ┌─────────────────┐
    │ Detect Embedded │        │      │ Skip to TOC     │
    │ Images (MuPDF)  │        │      │ Detection       │
    └────────┬────────┘        │      └─────────────────┘
             │                 │
    ┌────────▼────────┐        │
    │ Images Found?   │        │
    └────────┬────────┘        │
             │                 │
    ┌────────┴────────┐        │
    │ YES             │ NO     │
    ▼                 ▼        │
┌─────────┐    ┌─────────────┐ │
│ Extract │    │ LLM Visual  │ │
│ Direct  │    │ Detection   │ │
└────┬────┘    └──────┬──────┘ │
     │                │        │
     └───────┬────────┘        │
             │                 │
     ┌───────▼────────┐        │
     │ Has Visuals?   │        │
     └───────┬────────┘        │
             │                 │
    ┌────────┴────────┐        │
    │ YES             │ NO     │
    ▼                 │        │
┌─────────────┐       │        │
│ Page-to-Img │       │        │
│ + Crop      │       │        │
└──────┬──────┘       │        │
       │              │        │
       ▼              │        │
┌─────────────┐       │        │
│ Describe    │       │        │
│ (Parallel)  │       │        │
└──────┬──────┘       │        │
       │              │        │
       ▼              │        │
┌─────────────┐       │        │
│ Enrich Text │       │        │
└──────┬──────┘       │        │
       │              │        │
       └──────────────┴────────┘
                      │
             ┌────────▼────────┐
             │ TOC Detection   │
             │ (Step 2)        │
             └─────────────────┘
```

---

## Benefits of This Approach

| Aspect | Benefit |
|--------|---------|
| **Compatibility** | Works with existing PageIndex pipeline |
| **Efficiency** | Embedded extraction is fast, LLM fallback only when needed |
| **Quality** | Detailed descriptions captured in text for RAG |
| **Cost** | Only processes images when detected |
| **Scalability** | Parallel processing for multiple images |
| **Flexibility** | Configurable via options |

---

## Impact on Downstream Steps

### TOC Detection

Image descriptions enriched text may help TOC detection if visual elements indicate section boundaries.

### Tree Building

Image descriptions become part of node content, improving:
- Summary quality (includes visual information)
- RAG retrieval (queries about charts/diagrams return relevant sections)

### Node Splitting

Token counts increase with descriptions, so nodes may split more:
- Consider: Should image descriptions count toward `max_token_num_each_node`?
- Option: Separate threshold for visual content tokens

---

## Related Files in Sotaagents-enhance

| File | Purpose |
|------|---------|
| `lib/ocr/index.ts` | Main OCR orchestration |
| `lib/ocr/pdf-image-extractor.ts` | Embedded image extraction |
| `lib/ocr/gemini-ocr.ts` | Vision LLM image description |
| `lib/ocr/image-extractor.ts` | Bounding box cropping |
| `lib/ocr/image-storage.ts` | S3/Vercel Blob upload |
| `lib/ocr/pdf-converter.ts` | PDF to image conversion |

---

## Next Steps

1. **Implement in Python** - Port TypeScript logic to Python
2. **Add MuPDF dependency** - Already used by PyMuPDF
3. **Vision LLM integration** - Add GPT-4V/Gemini Vision support
4. **Cloud storage** - S3/GCS upload for production
5. **Testing** - Test with image-heavy documents
6. **Performance tuning** - Optimize concurrency and caching
