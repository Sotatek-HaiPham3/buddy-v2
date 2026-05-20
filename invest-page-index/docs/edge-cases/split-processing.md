# Edge Cases: Split Processing

## Case 4: Chunk Overlap for Large Documents

When splitting document into chunks for processing, 1 page overlap is used to ensure section boundaries aren't missed:

```python
def page_list_to_group_text(page_contents, token_lengths, max_tokens=20000, overlap_page=1):
    # ...
    overlap_start = max(i - overlap_page, 0)
    current_subset = page_contents[overlap_start:i]  # Include overlap
```

## Case 24: Smart Chunk Sizing

Uses averaged chunk size for balanced distribution:

```python
expected_parts_num = math.ceil(num_tokens / max_tokens)
average_tokens_per_part = math.ceil(((num_tokens / expected_parts_num) + max_tokens) / 2)
```

This prevents one chunk from being much larger than others.

## Case 25: Single Chunk Optimization

Skips chunking if document fits in one chunk:

```python
if num_tokens <= max_tokens:
    page_text = "".join(page_contents)
    return [page_text]  # No need to split
```

## Case 29: Empty Node List Safety

Safe fallback when splitting produces no valid items:

```python
node['end_index'] = valid_node_toc_items[0]['start_index'] if valid_node_toc_items else node['end_index']
```

## Splitting Threshold

Both conditions must be true to trigger split:

```yaml
max_page_num_each_node: 10      # Split if more than 10 pages
max_token_num_each_node: 20000  # AND more than 20k tokens
```

If a node has 15 pages but only 10,000 tokens, it won't be split.
If a node has 5 pages but 50,000 tokens, it won't be split.
Only when BOTH thresholds are exceeded does splitting occur.
