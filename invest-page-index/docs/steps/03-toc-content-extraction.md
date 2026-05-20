# Step 3: TOC Content Extraction

## Purpose

Concatenate TOC pages and normalize formatting using regex (not LLM).

## Process

1. Concatenate all TOC pages into single text
2. Replace dots `......` with colons `:` using regex

## Code

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

## Example

**Input (concatenated TOC pages):**
```
Company Report 2023

Table of Contents

1. Executive Summary .............. 1
   1.1 Overview ................... 3
2. Analysis ....................... 10

Page 2 of 50
```

**Output (dots replaced):**
```
Company Report 2023

Table of Contents

1. Executive Summary: 1
   1.1 Overview: 3
2. Analysis: 10

Page 2 of 50
```

## Notes

- Headers/footers are NOT removed at this step
- They get filtered out later during JSON transformation (Step 5)
- Regex is used instead of LLM for reliability and speed

## Flow

```
┌────────────────────────────────────────────────────────────────┐
│  Step 3: Extract TOC Content                                   │
│  Output: "1. Executive Summary: 1\n   1.1 Overview: 5\n..."    │
│          (dots replaced, but still raw text)                   │
└────────────────────────────────┬───────────────────────────────┘
                                 ▼
                          Step 4: Check for page numbers
                                 ▼
                          Step 5: Transform to JSON
```
