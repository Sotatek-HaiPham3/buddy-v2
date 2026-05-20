# Edge Cases: Format Conversion

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

## Case 16: Page Number Conversion with Safe Fallback

Keeps original value if conversion fails:

```python
def convert_page_to_int(data):
    for item in data:
        if 'page' in item and isinstance(item['page'], str):
            try:
                item['page'] = int(item['page'])
            except ValueError:
                pass  # Keep original string value
```

## Case 18: Filename Sanitization

Removes invalid characters from filenames:

```python
def sanitize_filename(filename, replacement='-'):
    # In Linux, only '/' and '\0' are invalid
    return filename.replace('/', replacement)
```

## Case 12: Bounds Checking Throughout

Multiple functions include bounds checking to prevent IndexError:

```python
# In process_none_page_numbers
list_index = page_index - start_index
if list_index >= 0 and list_index < len(page_list):
    # Safe to access
else:
    continue  # Skip

# In fix_incorrect_toc
if list_index < 0 or list_index >= len(toc_with_page_number):
    return { 'is_valid': False }  # Invalid index
```
