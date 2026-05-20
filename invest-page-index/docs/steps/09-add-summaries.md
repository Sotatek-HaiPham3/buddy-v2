# Step 9: Add Summaries (Optional)

## Purpose

Generate LLM summaries for each node to improve retrieval accuracy.

## Process

### 1. Add text content to each node

```python
add_node_text(structure, page_list)
# Each node gets: node['text'] = content from startIndex to endIndex
```

### 2. Flatten tree to list (top-down order)

```python
def structure_to_list(structure):
    nodes = []
    nodes.append(structure)        # Add current node
    if 'nodes' in structure:
        nodes.extend(structure_to_list(structure['nodes']))  # Then children
    return nodes
```

Order: Parent → Children → Grandchildren

```
Tree:                    List:
A                        [A, B, D, E, C, F]
├── B
│   ├── D
│   └── E
└── C
    └── F
```

### 3. Generate ALL summaries in PARALLEL

```python
async def generate_summaries_for_structure(structure, model):
    nodes = structure_to_list(structure)

    # All nodes processed simultaneously
    tasks = [generate_node_summary(node, model) for node in nodes]
    summaries = await asyncio.gather(*tasks)

    for node, summary in zip(nodes, summaries):
        node['summary'] = summary
```

### 4. LLM Prompt for each node

```
You are given a part of a document, your task is to generate a description
about what are main points covered in the partial document.

Partial Document Text: {node['text']}

Directly return the description.
```

### 5. Remove text after summaries (optional)

```python
if opt.if_add_node_text == 'no':
    remove_structure_text(structure)  # Keep summaries, remove raw text
```

### 6. Generate document description (optional)

```python
if opt.if_add_doc_description == 'yes':
    doc_description = generate_doc_description(clean_structure, model)
```

## Key Points

- **All levels** get summaries (root, middle, leaves)
- **Parallel execution** - all nodes processed simultaneously
- **Independent** - each summary based only on that node's text, not children's summaries

## Before (no summaries)

```json
{
  "title": "Risk Assessment",
  "startIndex": 10,
  "endIndex": 14
}
```

## After (with summaries)

```json
{
  "title": "Risk Assessment",
  "startIndex": 10,
  "endIndex": 14,
  "summary": "Analyzes key risks including market volatility, regulatory changes, and supply chain disruptions. Includes mitigation strategies."
}
```

## Why Summaries Help RAG

| Without Summaries | With Summaries |
|-------------------|----------------|
| LLM only sees title | LLM sees what section actually covers |
| Guesses based on title | Knows exact content |
| "Risk Assessment" - what kind of risk? | "...supply chain disruptions..." - exact match! |

## Configuration

```yaml
if_add_node_summary: "yes"     # Generate summaries for each node
if_add_doc_description: "no"   # Generate overall document description
if_add_node_text: "no"         # Keep raw text in output (default: no)
```

## Related Edge Cases

- **Temporary Text for Summary** - Text added then removed if not needed ([summary-generation.md](../edge-cases/summary-generation.md))
- **Empty Token Count** - Returns 0 for empty/None text ([summary-generation.md](../edge-cases/summary-generation.md))
- **Exception Handling in Concurrent Ops** - Catches errors without crashing ([llm-response.md](../edge-cases/llm-response.md))
