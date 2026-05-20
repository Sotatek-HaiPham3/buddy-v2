# Step 10: Output JSON Tree (Final Step)

## Purpose

Final assembly - add node IDs, package into JSON, and save to file.

## Process

### 1. Add Node IDs (optional)

```python
if opt.if_add_node_id == 'yes':
    write_node_id(structure)
```

Assigns unique IDs in **top-down order**:

```python
def write_node_id(data, node_id=0):
    data['node_id'] = str(node_id).zfill(4)  # "0000", "0001", etc.
    node_id += 1
    for child in data.get('nodes', []):
        node_id = write_node_id(child, node_id)
    return node_id
```

```
Before:                          After:
Executive Summary                Executive Summary (node_id: "0000")
├── Financial Overview           ├── Financial Overview (node_id: "0001")
├── Risk Assessment              ├── Risk Assessment (node_id: "0002")
Detailed Analysis                Detailed Analysis (node_id: "0003")
└── Market Trends                └── Market Trends (node_id: "0004")
```

### 2. Package into Final JSON

```python
return {
    'doc_name': get_pdf_name(doc),           # "annual-report-2023.pdf"
    'doc_description': doc_description,       # Optional (from Step 9)
    'structure': structure,                   # The hierarchical tree
}
```

### 3. Save to File

```python
output_file = f'./results/{pdf_name}_structure.json'
with open(output_file, 'w') as f:
    json.dump(result, f, indent=2)
```

## Final Output Example

```json
{
  "doc_name": "annual-report-2023.pdf",
  "doc_description": "2023 Annual Report covering financial performance and market analysis.",
  "structure": [
    {
      "title": "Executive Summary",
      "start_index": 1,
      "end_index": 14,
      "node_id": "0000",
      "summary": "Overview of 2023 financial performance...",
      "nodes": [
        {
          "title": "Financial Overview",
          "start_index": 5,
          "end_index": 7,
          "node_id": "0001",
          "summary": "Revenue grew 15% YoY..."
        },
        {
          "title": "Risk Assessment",
          "start_index": 8,
          "end_index": 14,
          "node_id": "0002",
          "summary": "Key risks include market volatility..."
        }
      ]
    },
    {
      "title": "Detailed Analysis",
      "start_index": 15,
      "end_index": 50,
      "node_id": "0003",
      "summary": "In-depth market and competitor analysis..."
    }
  ]
}
```

## Summary

| Action | What It Does |
|--------|--------------|
| Add Node IDs | Unique IDs ("0000", "0001"...) for each node |
| Package JSON | Wrap with `doc_name`, `doc_description`, `structure` |
| Save to File | Write to `./results/{pdf_name}_structure.json` |

## Configuration

```yaml
if_add_node_id: "yes"          # Add unique IDs to nodes
```

## Related Edge Cases

- **Filename Sanitization** - Removes invalid characters ([format-conversion.md](../edge-cases/format-conversion.md))
