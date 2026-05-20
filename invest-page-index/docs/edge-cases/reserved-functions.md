# Reserved/Unused Functions

These functions are defined in the codebase but NOT used in the main processing flow. They may be reserved for future use or alternative processing modes.

## Case 36: Unused Functions

### extract_toc_content()

**Location:** `utils.py`

**Purpose:** LLM-based TOC extraction (alternative to regex-based approach)

**Why unused:** Currently, TOC content extraction uses regex replacement (`re.sub`) which is faster and more reliable than LLM-based extraction.

```python
def extract_toc_content(toc_pages_text, model):
    """
    Extract clean TOC content using LLM.
    Currently not used - regex is preferred.
    """
    prompt = "Extract only the table of contents entries..."
    return ChatGPT_API(model, prompt)
```

### check_if_toc_extraction_is_complete()

**Location:** `utils.py`

**Purpose:** Validates if TOC extraction captured all items

**Why unused:** Part of the LLM-based extraction flow that isn't currently active.

```python
def check_if_toc_extraction_is_complete(original_toc, extracted_toc, model):
    """
    Check if extracted TOC matches original.
    Currently not used.
    """
    pass
```

### remove_first_physical_index_section()

**Location:** `page_index.py`

**Purpose:** Removes the first section from physical index list

**Why unused:** May have been used in earlier versions or reserved for specific document types.

```python
def remove_first_physical_index_section(toc_items):
    """
    Remove first section from TOC items.
    Currently not used in main flow.
    """
    return toc_items[1:] if len(toc_items) > 1 else toc_items
```

## Potential Future Uses

These functions might be activated for:
- Documents where regex TOC cleaning fails
- Special document formats requiring custom extraction
- Alternative processing pipelines
- Debug/validation modes

## Note

When modifying the codebase, be aware these functions exist but aren't part of the active pipeline. They can be safely ignored for understanding the current flow, but should not be removed without checking if they're used elsewhere or planned for future features.
