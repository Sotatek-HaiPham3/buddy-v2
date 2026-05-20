# Phase 2: Query-Time Retrieval

After the index is generated (Phase 1), use LLM reasoning to retrieve relevant sections.

## How It Works

1. Present tree structure to LLM
2. Ask: "Which sections are relevant to answer this question?"
3. LLM reasons through the hierarchy
4. Returns relevant page ranges
5. Fetch and use those pages for final answer

## Example Query Flow

**User Query:** "What are the company's main risks?"

**LLM Reasoning:**
```
Looking at the document structure:
- Executive Summary (pages 1-14)
  - Financial Overview (pages 5-7)
  - Risk Assessment (pages 8-14) ← Relevant!
- Detailed Analysis (pages 15-50)
  - Market Trends (pages 15-25)
  - Risk Factors (pages 26-35) ← Also relevant!
- Conclusion (pages 45-50)

I should look at:
1. Risk Assessment (pages 8-14) - summary mentions "key risks"
2. Risk Factors (pages 26-35) - detailed risk analysis
```

**Retrieve:** Pages 8-14 and 26-35

**Generate Answer:** Using retrieved content

## Advantage Over Vector Search

| Vector Search | PageIndex Reasoning |
|---------------|---------------------|
| Finds similar text | Finds relevant answers |
| No explanation | LLM shows reasoning |
| Flat chunks | Hierarchical navigation |
| May miss context | Maintains document structure |

## Why Reasoning > Similarity

**Query:** "What risks should I consider before investing?"

**Vector Search Result:** Might return chunks about "investment opportunities" (similar words to "investing") but miss the actual risk sections.

**PageIndex Result:** LLM reads "Risk Assessment" and "Risk Factors" titles/summaries and correctly identifies these as relevant, even though "investing" doesn't appear in those section titles.

## Implementation Pattern

```python
def query_document(structure, query, page_list):
    # 1. Present structure to LLM
    prompt = f"""
    Given this document structure:
    {json.dumps(structure, indent=2)}

    Which sections are relevant to answer: "{query}"

    Return the section node_ids and page ranges.
    """

    # 2. LLM reasons and returns relevant sections
    relevant_sections = llm_call(prompt)

    # 3. Fetch content from those pages
    content = ""
    for section in relevant_sections:
        start = section['start_index']
        end = section['end_index']
        for i in range(start, end + 1):
            content += page_list[i - 1][0]

    # 4. Generate final answer using retrieved content
    answer_prompt = f"""
    Using this content:
    {content}

    Answer: {query}
    """

    return llm_call(answer_prompt)
```

## Summaries Enhance Retrieval

When `if_add_node_summary="yes"`, the LLM can use summaries to make better decisions:

**Without summaries:**
```json
{"title": "Risk Assessment", "start_index": 8, "end_index": 14}
```
LLM guesses based on title alone.

**With summaries:**
```json
{
  "title": "Risk Assessment",
  "start_index": 8,
  "end_index": 14,
  "summary": "Analyzes key risks including market volatility, regulatory changes, and supply chain disruptions. Includes mitigation strategies."
}
```
LLM knows exactly what the section covers.

## Multi-Level Navigation

The tree structure enables hierarchical reasoning:

```
Query: "What are the long-term growth projections?"

LLM Reasoning:
1. Top-level scan: "Detailed Analysis" looks promising
2. Check children: "Growth Projections" subsection exists!
3. Check its children: "Long-term Projections" - exact match!
4. Return pages 69-80
```

This avoids scanning the entire document.
