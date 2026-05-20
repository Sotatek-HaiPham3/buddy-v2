# Edge Cases: Tree Building

## Case 7: Duplicate Title Handling in Split

When splitting a large node, if the first generated sub-section has the SAME title as the parent, it's excluded to avoid duplication:

```python
if valid_node_toc_items and node['title'].strip() == valid_node_toc_items[0]['title'].strip():
    # First child has same title as parent - skip it
    node['nodes'] = post_processing(valid_node_toc_items[1:], node['end_index'])
else:
    node['nodes'] = post_processing(valid_node_toc_items, node['end_index'])
```

## Case 17: Tree Conversion Fallback

If tree conversion fails, returns cleaned flat list:

```python
def post_processing(structure, end_physical_index):
    # ... calculate start_index and end_index ...
    tree = list_to_tree(structure)
    if len(tree) != 0:
        return tree
    else:
        # Tree conversion failed, return flat list instead
        for node in structure:
            node.pop('appear_start', None)
            node.pop('physical_index', None)
        return structure
```

## Case 33: Orphan Node Handling in Tree Building

If a node's parent structure doesn't exist, it becomes a root node:

```python
def list_to_tree(data):
    for item in data:
        parent_structure = get_parent_structure(structure)  # e.g., "1" for "1.1"

        if parent_structure:
            if parent_structure in nodes:
                nodes[parent_structure]['nodes'].append(node)  # Normal case
            else:
                root_nodes.append(node)  # Parent not found = treat as root
        else:
            root_nodes.append(node)  # No parent = root node
```

**Example:** If structure "2.1" exists but "2" was filtered out, "2.1" becomes a root node.

## Case 37: Parent Structure Parsing

Structure hierarchy is determined by splitting on `.`:

```python
def get_parent_structure(structure):
    if not structure:
        return None
    parts = str(structure).split('.')
    return '.'.join(parts[:-1]) if len(parts) > 1 else None

# Examples:
# "1"     → None (root)
# "1.1"   → "1"
# "1.1.1" → "1.1"
# "2.3.4" → "2.3"
```

## Case 10: Filter None Physical Index Items

Before processing steps, items with None physical_index are filtered:

```python
# In meta_processor
toc_with_page_number = [item for item in toc_with_page_number if item.get('physical_index') is not None]

# In tree_parser
valid_toc_items = [item for item in toc_with_page_number if item.get('physical_index') is not None]

# In process_large_node_recursively
valid_node_toc_items = [item for item in node_toc_tree if item.get('physical_index') is not None]
```
