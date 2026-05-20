# Edge Cases: API Retry Mechanism

## API Retry Logic

All LLM API calls have built-in retry logic with 10 retries and 1 second delay:

```python
def ChatGPT_API(model, prompt, api_key):
    max_retries = 10
    for i in range(max_retries):
        try:
            response = client.chat.completions.create(...)
            return response.choices[0].message.content
        except Exception as e:
            logging.error(f"Error: {e}")
            if i < max_retries - 1:
                time.sleep(1)  # Wait 1 second before retry
            else:
                logging.error('Max retries reached')
                return "Error"
```

## Async Version

Uses `await asyncio.sleep(1)` for non-blocking retries:

```python
async def ChatGPT_API_async(model, prompt, api_key):
    max_retries = 10
    for i in range(max_retries):
        try:
            response = await client.chat.completions.create(...)
            return response.choices[0].message.content
        except Exception as e:
            logging.error(f"Error: {e}")
            if i < max_retries - 1:
                await asyncio.sleep(1)  # Non-blocking wait
            else:
                logging.error('Max retries reached')
                return "Error"
```

## Error Types Handled

- Connection errors
- Rate limiting (429)
- Timeout errors
- API server errors (5xx)

## Retry Configuration

| Parameter | Value |
|-----------|-------|
| Max retries | 10 |
| Delay between retries | 1 second |
| Return on all failures | "Error" string |

## Usage in Pipeline

Every LLM call in the pipeline uses this retry wrapper:
- TOC detection
- Page number detection
- TOC transformation
- Physical index extraction
- Title verification
- Summary generation
