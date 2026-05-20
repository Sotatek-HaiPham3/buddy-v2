# Step 1: PDF Extraction

## Purpose

Extract text content and token counts from each page of the PDF.

## Input

PDF file (path or BytesIO object)

## Output

List of pages with text and token counts:

```json
[
  { "pageNumber": 1, "text": "...", "tokenCount": 450 },
  { "pageNumber": 2, "text": "...", "tokenCount": 523 },
  ...
]
```

## Implementation

```python
def get_page_tokens(doc):
    page_list = []
    for page_num in range(len(pdf)):
        page = pdf[page_num]
        text = page.extract_text()
        token_count = count_tokens(text)
        page_list.append((text, token_count))
    return page_list
```

## Related Edge Cases

- **Input Type Validation** - Supports file paths and BytesIO ([input-validation.md](../edge-cases/input-validation.md))
- **PDF Parser Options** - PyPDF2 (default) or PyMuPDF ([input-validation.md](../edge-cases/input-validation.md))
- **Empty Token Count** - Returns 0 for empty/None text ([summary-generation.md](../edge-cases/summary-generation.md))
