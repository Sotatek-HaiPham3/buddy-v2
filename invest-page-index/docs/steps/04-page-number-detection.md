# Step 4: Page Number Detection

## Purpose

Check if the TOC contains page numbers - this determines the processing path.

## LLM Prompt

```
Your job is to detect if there are page numbers/indices in the table of contents.

Given text: {toc_content}

Return JSON:
{
    "thinking": "<reasoning>",
    "page_index_given_in_toc": "yes" or "no"
}
```

## Why This Matters

| Result | Processing Path |
|--------|-----------------|
| **YES** | Use page numbers directly → `process_toc_with_page_numbers` (fast) |
| **NO** | Go directly to `process_no_toc` - scan entire document (slow) |

## Important Flow Detail

When TOC is found but has NO page numbers, it goes **DIRECTLY** to `process_no_toc`, NOT to `process_toc_no_page_numbers`:

```python
# In tree_parser
if toc_content AND toc_content.strip() AND page_index_given_in_toc == "yes":
    mode = 'process_toc_with_page_numbers'
else:
    mode = 'process_no_toc'  # Skips process_toc_no_page_numbers!
```

`process_toc_no_page_numbers` is ONLY used as a fallback when `process_toc_with_page_numbers` fails (accuracy ≤ 60%).

## Related Edge Cases

- **TOC Without Page Numbers → Direct to No-TOC Mode** ([toc-processing.md](../edge-cases/toc-processing.md))
