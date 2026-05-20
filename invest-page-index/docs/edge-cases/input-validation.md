# Edge Cases: Input Validation

## Case 2: Input Type Validation

PageIndex supports both file paths and in-memory BytesIO objects:

```python
is_valid_pdf = (
    (isinstance(doc, str) and os.path.isfile(doc) and doc.lower().endswith(".pdf")) or
    isinstance(doc, BytesIO)
)
if not is_valid_pdf:
    raise ValueError("Unsupported input type. Expected a PDF file path or BytesIO object.")
```

## Case 3: PDF Parser Options

Two PDF parsing backends are supported (in `get_page_tokens`):

| Parser | Use Case |
|--------|----------|
| **PyPDF2** (default) | Standard Python PDF library |
| **PyMuPDF** | Faster, better for complex PDFs |

## Case 19: Config Validation

Validates user-provided config keys:

```python
def _validate_keys(self, user_dict):
    unknown_keys = set(user_dict) - set(self._default_dict)
    if unknown_keys:
        raise ValueError(f"Unknown config keys: {unknown_keys}")
```

This prevents typos in configuration from being silently ignored.
