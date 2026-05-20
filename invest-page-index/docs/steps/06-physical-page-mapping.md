# Step 6: Physical Page Mapping

## Purpose

Map TOC page numbers to actual PDF page indices.

## Problem

TOC says "page 1" but actual content might start at PDF page 5 (due to cover, preface, etc.)

## Detailed Process

### 1. Get JSON TOC from Step 5

```json
[
  { "structure": "1", "title": "Executive Summary", "page": 1 },
  { "structure": "1.1", "title": "Overview", "page": 3 },
  { "structure": "2", "title": "Analysis", "page": 10 }
]
```

### 2. Search first N pages AFTER TOC for section titles

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

### 3. Ask LLM to find where titles appear

**LLM Prompt (`toc_index_extractor`):**

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

### 4. Match TOC entries with found physical indices

```
TOC entry: { title: "Executive Summary", page: 1 }
Found at:  { title: "Executive Summary", physical_index: 5 }
→ Match!
```

### 5. Calculate offset using MOST COMMON difference

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

### 6. Apply offset to ALL entries

```python
for item in toc:
    item['physical_index'] = item['page'] + offset
    del item['page']
```

### 7. Handle entries without physical_index

Some TOC entries might not have page numbers. The `process_none_page_numbers()` function handles these by searching between known indices.

## Example

```
Before offset:                      After offset:
─────────────                       ────────────
page: 1  →  physical_index: 5
page: 3  →  physical_index: 7
page: 10 →  physical_index: 14
```

## Sub-Steps

### Step 6.5: Validate Physical Indices

Remove TOC entries that reference pages beyond document length:

```python
def validate_and_truncate_physical_indices(toc_with_page_number, page_list_length, start_index=1):
    max_allowed_page = page_list_length + start_index - 1

    for item in toc_with_page_number:
        if item.get('physical_index') is not None:
            if item['physical_index'] > max_allowed_page:
                item['physical_index'] = None  # Remove invalid index
```

### Step 6.6: Verification & Fix

Verify mapped indices are correct and fix errors. See [verification-fix.md](../edge-cases/verification-fix.md).

### Step 6.7: Add Preface

Add a "Preface" node if content exists before the first TOC section:

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

### Step 6.8: Check Title Appearance at Start

Determine if section title appears at the START of its page (affects end_index calculation):

```python
async def check_title_appearance_in_start_concurrent(structure, page_list, model):
    for item in structure:
        page_text = page_list[item['physical_index'] - 1][0]
        result = await check_title_appearance_in_start(item['title'], page_text, model)
        item['appear_start'] = result  # "yes" or "no"
```

**Why this matters:**
- If section starts at BEGINNING of page → previous section ends on page BEFORE
- If section starts in MIDDLE of page → previous section ends on SAME page

## Related Edge Cases

- **Offset Calculation Null Safety** - Returns None if no valid pairs ([physical-mapping.md](../edge-cases/physical-mapping.md))
- **Physical Index Minimum Validation** - Only uses indices >= start_page_index ([physical-mapping.md](../edge-cases/physical-mapping.md))
- **Early Return in Verification** - Returns 0% if last index in first half ([physical-mapping.md](../edge-cases/physical-mapping.md))
- **Sampling Verification** - Can check only N random samples ([physical-mapping.md](../edge-cases/physical-mapping.md))
