# Step 5: TOC Transformation (Text → JSON)

## Purpose

Convert cleaned TOC text into structured JSON that code can work with.

## Why This Step Is Needed

| Text Format | JSON Format |
|-------------|-------------|
| Hard to parse programmatically | Easy to iterate and process |
| Hierarchy unclear | `structure` field shows hierarchy (1, 1.1, 1.2) |
| Can't easily extract page numbers | `page` field is a number |

## Before (cleaned TOC text from Step 3)

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

## After (Transform to JSON)

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

## LLM Prompt

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

## Continuation Handling (Error Recovery)

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

## Related Edge Cases

- **JSON Truncation** - Truncates at last valid `}` when cut off ([llm-response.md](../edge-cases/llm-response.md))
- **Markdown Code Block Handling** - Handles `json` wrapped continuations ([llm-response.md](../edge-cases/llm-response.md))
- **JSON Extraction with Fallbacks** - Multiple fallback attempts for parsing ([llm-response.md](../edge-cases/llm-response.md))
