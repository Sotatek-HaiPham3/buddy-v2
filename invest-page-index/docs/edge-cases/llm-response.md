# Edge Cases: LLM Response Handling

## Case 8: Default Values for Missing LLM Keys

When LLM response doesn't contain expected keys, safe defaults are used:

```python
# In check_title_appearance
if 'answer' in response:
    answer = response['answer']
else:
    answer = 'no'  # Default to 'no' if key missing

# In check_title_appearance_in_start
return response.get("start_begin", "no")  # Default to 'no'
```

## Case 9: Exception Handling in Concurrent Operations

Async operations catch and log exceptions without crashing:

```python
results = await asyncio.gather(*tasks, return_exceptions=True)
for item, result in zip(valid_items, results):
    if isinstance(result, Exception):
        logger.error(f"Error checking start for {item['title']}: {result}")
        item['appear_start'] = 'no'  # Safe default
    else:
        item['appear_start'] = result
```

## Case 14: JSON Extraction with Fallbacks

Multiple fallback attempts for parsing LLM JSON responses:

```python
def extract_json(content):
    try:
        # Try to extract from ```json blocks
        # Clean up common issues (None → null, newlines, whitespace)
        return json.loads(json_content)
    except json.JSONDecodeError:
        try:
            # Remove trailing commas and retry
            json_content = json_content.replace(',]', ']').replace(',}', '}')
            return json.loads(json_content)
        except:
            return {}  # Empty dict as last resort
    except Exception:
        return {}
```

## Case 20: JSON Truncation for Incomplete Responses

When LLM output is cut off mid-JSON, truncates at last valid `}`:

```python
position = last_complete.rfind('}')
if position != -1:
    last_complete = last_complete[:position+2]  # Keep valid portion
```

## Case 21: Markdown Code Block Handling

Handles when LLM wraps continuation in markdown:

```python
if new_complete.startswith('```json'):
    new_complete = get_json_content(new_complete)
    last_complete = last_complete + new_complete
```

## Case 26: Finish Reason Validation

Raises exception if LLM didn't complete normally:

```python
if finish_reason == 'finished':
    return extract_json(response)
else:
    raise Exception(f'finish reason: {finish_reason}')
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
