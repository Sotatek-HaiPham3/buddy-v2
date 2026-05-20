# Edge Cases: Verification & Fix

## Verification Process (Step 6.6)

After mapping, the system **verifies** each entry is actually correct:

### 1. Sample verification

```python
# For each TOC entry, check if title appears at that physical page
accuracy, incorrect_results = await verify_toc(page_list, toc_with_page_number)
```

**LLM Prompt (for each entry):**

```
Check if the given section appears or starts in the given page_text.

Section title: "Executive Summary"
Page text: {content of page 5}

Return JSON:
{
  "thinking": "<reasoning>",
  "answer": "yes" or "no"
}
```

### 2. If accuracy > 60% but some are wrong, fix them

```python
if accuracy > 0.6 and len(incorrect_results) > 0:
    toc = await fix_incorrect_toc_with_retries(toc, page_list, incorrect_results)
```

### 3. Fix process

- For each incorrect entry, search between previous and next correct entries
- Ask LLM to find correct physical index
- Retry up to 3 times

### 4. Fallback chain (if accuracy ≤ 60%)

```
process_toc_with_page_numbers (failed)
        ↓
process_toc_no_page_numbers (ignore page numbers, search document)
        ↓
process_no_toc (generate structure from content)
```

## Case 27: Division by Zero Protection

Safe accuracy calculation:

```python
accuracy = correct_count / checked_count if checked_count > 0 else 0
```

## Case 28: Perfect Accuracy Short-Circuit

Returns immediately if 100% accuracy (no fixing needed):

```python
if accuracy == 1.0 and len(incorrect_results) == 0:
    return toc_with_page_number  # Skip fix step
```

## Case 32: Fix Loop with Two Exit Conditions

Continues fixing until ALL fixed OR max attempts:

```python
while current_incorrect:  # Still have incorrect items
    current_toc, current_incorrect = await fix_incorrect_toc(...)
    fix_attempt += 1
    if fix_attempt >= max_attempts:
        logger.info("Maximum fix attempts reached")
        break  # Give up after 3 tries
```

## Meta Processor Flow

```python
async def meta_processor(page_list, mode, toc_content, ...):
    # ... process based on mode ...

    accuracy, incorrect_results = await verify_toc(...)

    if accuracy > 0.6 and len(incorrect_results) > 0:
        # Fix incorrect items
        toc = await fix_incorrect_toc_with_retries(...)
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
