# Step 2: TOC Detection

## Purpose

Find which pages in the PDF contain a Table of Contents.

## Process

1. Scan first N pages (default: 20, configurable via `toc_check_page_num`)
2. For each page, ask LLM: "Is this a Table of Contents?"
3. Stop when consecutive TOC pages end

## LLM Prompt

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

## Output

List of TOC page indices, e.g., `[2, 3]`

## Code Flow

```python
def find_toc_pages(start_page_index, page_list, opt):
    toc_page_list = []
    last_page_is_yes = True
    i = start_page_index

    while i < len(page_list):
        # Only stop if past max AND not currently finding TOC
        if i >= opt.toc_check_page_num and not last_page_is_yes:
            break

        response = check_if_toc(page_list[i], opt.model)

        if response['toc_detected'] == 'yes':
            toc_page_list.append(i)
            last_page_is_yes = True
        else:
            last_page_is_yes = False

        i += 1

    return toc_page_list
```

## Related Edge Cases

- **TOC Detection Beyond Max Pages** - Continues scanning if actively finding TOC ([toc-processing.md](../edge-cases/toc-processing.md))
- **Multiple TOC Search** - Searches for additional TOCs if first has no page numbers ([toc-processing.md](../edge-cases/toc-processing.md))
- **TOC Content Whitespace Check** - Must be non-empty AND not just whitespace ([toc-processing.md](../edge-cases/toc-processing.md))
