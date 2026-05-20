# Edge Cases: Summary Generation

## Case 13: Empty Token Count Handling

Returns 0 for empty/None text:

```python
def count_tokens(text, model=None):
    if not text:
        return 0
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))
```

## Case 30: Temporary Text for Summary Generation

Text is added temporarily for summary, then removed:

```python
if opt.if_add_node_summary == 'yes':
    if opt.if_add_node_text == 'no':
        add_node_text(structure, page_list)      # Temporarily add
    await generate_summaries_for_structure(...)
    if opt.if_add_node_text == 'no':
        remove_structure_text(structure)          # Remove after
```

This ensures summaries can be generated without bloating the final output with raw text.

## Summary Generation Flow

1. Add text content to each node (temporary if not needed in output)
2. Flatten tree to list (top-down order)
3. Generate ALL summaries in PARALLEL using `asyncio.gather`
4. Each summary is independent (based only on that node's text)
5. Remove text if not needed in output

```python
async def generate_summaries_for_structure(structure, model):
    nodes = structure_to_list(structure)

    # All nodes processed simultaneously
    tasks = [generate_node_summary(node, model) for node in nodes]
    summaries = await asyncio.gather(*tasks)

    for node, summary in zip(nodes, summaries):
        node['summary'] = summary
```
