# Configuration System

PageIndex uses a YAML-based configuration system with sensible defaults.

## ConfigLoader Class

```python
class ConfigLoader:
    def __init__(self, default_path="config.yaml"):
        self._default_dict = self._load_yaml(default_path)

    def load(self, user_opt=None):
        # Merge user options with defaults
        merged = {**self._default_dict, **user_opt}
        return config(**merged)
```

## Default Configuration (config.yaml)

```yaml
model: "gpt-4o-2024-11-20"
toc_check_page_num: 20
max_page_num_each_node: 10
max_token_num_each_node: 20000
if_add_node_id: "yes"
if_add_node_summary: "yes"
if_add_doc_description: "no"
if_add_node_text: "no"
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `gpt-4o-2024-11-20` | LLM model to use |
| `toc_check_page_num` | int | 20 | Max pages to scan for TOC |
| `max_page_num_each_node` | int | 10 | Split threshold (pages) |
| `max_token_num_each_node` | int | 20000 | Split threshold (tokens) |
| `if_add_node_id` | string | `yes` | Add unique IDs to nodes |
| `if_add_node_summary` | string | `yes` | Generate summaries |
| `if_add_doc_description` | string | `no` | Generate document description |
| `if_add_node_text` | string | `no` | Keep raw text in output |

## Usage

### Use Defaults

```python
from pageindex import page_index

result = page_index("document.pdf")
```

### Override Specific Options

```python
result = page_index(
    "document.pdf",
    model="gpt-4o",
    max_page_num_each_node=15,
    if_add_node_summary="no"
)
```

### Override Multiple Options

```python
result = page_index(
    "document.pdf",
    model="gpt-4o-mini",
    toc_check_page_num=30,
    max_page_num_each_node=20,
    max_token_num_each_node=30000,
    if_add_node_id="yes",
    if_add_node_summary="yes",
    if_add_doc_description="yes",
    if_add_node_text="no"
)
```

## Config Validation

Validates user-provided config keys to catch typos:

```python
def _validate_keys(self, user_dict):
    unknown_keys = set(user_dict) - set(self._default_dict)
    if unknown_keys:
        raise ValueError(f"Unknown config keys: {unknown_keys}")
```

**Example:**

```python
# This will raise an error
result = page_index("doc.pdf", modle="gpt-4o")  # Typo: "modle"
# ValueError: Unknown config keys: {'modle'}
```

## Node Splitting Logic

**Important:** A node is only split if BOTH conditions are true:

```python
if pages > max_page_num_each_node AND tokens > max_token_num_each_node:
    split_node()
```

Examples:
- 15 pages, 10k tokens → NOT split (tokens below threshold)
- 5 pages, 50k tokens → NOT split (pages below threshold)
- 15 pages, 25k tokens → SPLIT (both exceed thresholds)

## Output Control

| Option | Effect on Output |
|--------|-----------------|
| `if_add_node_id="yes"` | Adds `"node_id": "0001"` to each node |
| `if_add_node_summary="yes"` | Adds `"summary": "..."` to each node |
| `if_add_doc_description="yes"` | Adds top-level `"doc_description": "..."` |
| `if_add_node_text="yes"` | Adds `"text": "..."` with raw content to each node |
