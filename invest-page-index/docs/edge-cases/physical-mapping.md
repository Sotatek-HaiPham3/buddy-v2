# Edge Cases: Physical Page Mapping

## Case 5: Early Return in Verification

If the last TOC entry's physical index is in the first half of the document, verification returns 0% accuracy immediately (assumes something is wrong):

```python
async def verify_toc(page_list, list_result, ...):
    # Find the last non-None physical_index
    last_physical_index = ...

    # Early return if indices don't cover enough of document
    if last_physical_index is None or last_physical_index < len(page_list)/2:
        return 0, []  # Accuracy 0, triggers fallback
```

## Case 6: Sampling Verification (Optional)

Verification can check only N random samples instead of all items:

```python
async def verify_toc(page_list, list_result, start_index=1, N=None, model=None):
    if N is None:
        sample_indices = range(0, len(list_result))  # Check all
    else:
        N = min(N, len(list_result))
        sample_indices = random.sample(range(0, len(list_result)), N)  # Random sample
```

## Case 15: Physical Index Format Conversion

Handles multiple physical_index string formats:

```python
def convert_physical_index_to_int(data):
    if isinstance(data, str):
        if data.startswith('<physical_index_'):      # <physical_index_5>
            data = int(data.split('_')[-1].rstrip('>').strip())
        elif data.startswith('physical_index_'):     # physical_index_5
            data = int(data.split('_')[-1].strip())
        if isinstance(data, int):
            return data
        else:
            return None  # Conversion failed
```

## Case 23: Offset Calculation Null Safety

Returns None if no valid pairs found:

```python
def calculate_page_offset(pairs):
    differences = []
    for pair in pairs:
        try:
            difference = pair['physical_index'] - pair['page']
            differences.append(difference)
        except (KeyError, TypeError):
            continue  # Skip invalid pairs

    if not differences:
        return None  # No valid data to calculate offset
```

## Case 31: Physical Index Minimum Validation

Only uses physical indices >= start_page_index:

```python
if physical_index is not None and int(physical_index) >= start_page_index:
    pairs.append(...)
```

## Validate Physical Indices (Step 6.5)

Remove TOC entries that reference pages beyond document length:

```python
def validate_and_truncate_physical_indices(toc_with_page_number, page_list_length, start_index=1):
    max_allowed_page = page_list_length + start_index - 1

    for item in toc_with_page_number:
        if item.get('physical_index') is not None:
            if item['physical_index'] > max_allowed_page:
                item['physical_index'] = None  # Remove invalid index
                logger.info(f"Removed physical_index for '{item['title']}' (was beyond document)")
```

**Why this is needed:**
- PDF might be truncated/corrupted
- TOC might reference appendices that aren't in the file
- Prevents IndexError during later processing
