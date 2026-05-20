# Open Questions

Design decisions that need resolution before or during implementation.

---

## 1. Table Size Limits

### Question
How large can a table be before we need pagination/chunking?

### Considerations
- LLM context limits for sub-agent (typically 100K-200K tokens)
- Database storage costs (JSONB columns)
- Query performance
- Network transfer time

### Options

**Option A: Hard limit at 10,000 rows**
- Simple to implement
- Covers 90% of use cases
- Rejects very large files

**Option B: Tiered storage**
- <10K rows: inline in database
- 10K-100K rows: blob storage with streaming
- >100K rows: require pre-filtering

**Option C: Always stream**
- Never load full table in memory
- Process in chunks
- More complex implementation

### Proposed Resolution
Start with **Option A** (10K limit). Evaluate real usage patterns. Implement Option B if needed.

### Follow-up Questions
- What's the typical table size in user documents?
- How often do users need to query tables >10K rows?

---

## 2. Table Update Handling

### Question
What happens when a document is re-uploaded with updated tables?

### Considerations
- Table IDs are referenced in PageIndexTree
- Training may have referenced old table data
- Agent prompts may reference table metadata

### Options

**Option A: Generate new tableIds, invalidate training**
- Clean slate on re-upload
- Forces retraining
- Breaks any external references

**Option B: Preserve tableIds, update data**
- Same IDs for "same" tables
- Need to detect which tables match
- May cause inconsistencies if structure changes

**Option C: Version tables**
- Keep old versions
- New version gets new ID
- Tree updated to point to latest

### Proposed Resolution
**Option A** for simplicity. Document re-upload is a significant event that should trigger retraining anyway.

### Follow-up Questions
- How do we detect "same" table across versions?
- Should users be warned about training invalidation?

---

## 3. Cross-Table Queries

### Question
Should the agent be able to join tables from different documents?

### Considerations
- Significantly increases complexity
- Requires schema unification
- May cause confusion (which "Revenue" column?)
- Powerful for multi-document analysis

### Options

**Option A: No cross-document queries**
- Simple and clear
- Each document is isolated
- Users must manually correlate

**Option B: Cross-document within same agent**
- Tables from all agent documents are queryable together
- Sub-agent receives multi-table context
- Need schema conflict resolution

**Option C: Explicit cross-document queries**
- User must specify which documents to include
- Agent asks for clarification if ambiguous
- More control, less magic

### Proposed Resolution
**Option A** for Phase 1-4. Evaluate need for **Option C** in Phase 5.

### Follow-up Questions
- How common is the need to query across documents?
- How do we handle column name conflicts?

---

## 4. Query Execution Safety

### Question
How do we sandbox code execution for table queries?

### Considerations
- Sub-agent generates SQL/pandas code
- Generated code could be malicious or buggy
- Need to protect system resources
- Need to prevent data exfiltration

### Options

**Option A: SQL only (DuckDB)**
- DuckDB is inherently safe (no system access)
- Limited to SQL expressiveness
- Some analyses hard to express in SQL

**Option B: SQL + sandboxed Python**
- DuckDB for simple queries
- Pyodide (WASM Python) for complex analysis
- No network, no filesystem

**Option C: Separate execution service**
- Dedicated sandboxed container
- Run any code safely
- Higher latency, more infrastructure

### Proposed Resolution
**Option B**: DuckDB for most queries, Pyodide for complex analysis. Keep execution in-process for low latency.

### Follow-up Questions
- What Pyodide version supports pandas well?
- What's the memory footprint of Pyodide?
- Can we cache Pyodide instances?

---

## 5. Table Format Preservation

### Question
Should we preserve original formatting (bold headers, merged cells, colors)?

### Considerations
- Formatting may indicate data meaning (bold = header)
- Adds complexity to storage
- May affect type inference
- UI might want to display formatted view

### Options

**Option A: Structure only, no formatting**
- Simpler storage
- Formatting extracted during parsing, then discarded
- Focus on data, not presentation

**Option B: Store formatting as metadata**
- Separate `formatting` column in AgentTable
- Available for UI rendering
- Not used in queries

**Option C: Preserve inline formatting**
- Store formatted values (e.g., "$1,234.56" not 1234.56)
- Requires parsing during queries
- Most faithful to original

### Proposed Resolution
**Option A** for data, with formatting hints extracted during parsing (e.g., "header row detected from bold text"). Don't store raw formatting.

---

## 6. Mixed Cell Content

### Question
What if a cell contains both text and numbers (e.g., "Revenue: $1.2M")?

### Considerations
- Common in semi-structured data
- May appear in headers or labels
- Type inference becomes complex

### Options

**Option A: Type as string, parse during query**
- Store verbatim
- Sub-agent extracts values when needed
- Flexible but slower

**Option B: Parse and split**
- Extract numeric value to separate field
- Keep text as label
- Structured but may lose context

**Option C: Infer primary type**
- Classify as "currency" if pattern matches
- Store raw value
- Parse known patterns

### Proposed Resolution
**Option A**: Type as string, let sub-agent handle parsing. Sub-agent is smart enough to extract "$1.2M" as a number when needed.

---

## 7. Formula Handling

### Question
Should we preserve Excel formulas or just values?

### Considerations
- Formulas show relationships between cells
- Computed values may be stale
- Formulas add storage/processing complexity
- Most users care about values, not formulas

### Options

**Option A: Values only**
- Evaluate formulas, store results
- Simple and sufficient for most cases
- Loses formula logic

**Option B: Store formulas as metadata**
- Primary data is values
- Formulas stored separately
- Available for analysis if needed

**Option C: Store both**
- Values for querying
- Formulas for understanding
- Increases storage

### Proposed Resolution
**Option A**: Values only. If formulas become important, revisit with Option B.

---

## 8. Table Detection Accuracy

### Question
How do we handle ambiguous cases (is this a table or formatted text)?

### Considerations
- Zone classifier may have low confidence
- Misclassification impacts user experience
- User intervention adds friction

### Options

**Option A: Threshold-based fallback**
- Confidence > 80%: use classification
- Confidence < 80%: default to text
- Simple but may miss tables

**Option B: LLM verification for uncertain cases**
- Low confidence triggers LLM review
- Higher accuracy
- More latency/cost

**Option C: User confirmation**
- Show detected zones to user
- User confirms/corrects
- Most accurate but adds friction

### Proposed Resolution
**Option B**: LLM verification for uncertain cases. Silent operation preferred over user friction.

### Follow-up Questions
- What confidence threshold triggers LLM review?
- Should we batch uncertain regions for one LLM call?

---

## 9. Empty/Sparse Tables

### Question
How do we handle tables with many empty cells?

### Considerations
- Sparse data is common (e.g., only some products in some regions)
- Empty cells may be intentional (no data) or errors
- Affects column type inference

### Options

**Option A: Preserve all empty cells**
- Store as null/empty
- Accurate representation
- May inflate storage

**Option B: Sparse representation**
- Only store non-empty cells
- Reconstruct on query
- More complex but efficient

**Option C: Filter threshold**
- If row is >50% empty, exclude
- If column is >80% empty, exclude
- May lose intentional sparse data

### Proposed Resolution
**Option A**: Preserve empty cells as null. Let sub-agent handle sparse data. Don't impose arbitrary filters.

---

## 10. Multi-Language Support

### Question
How do we handle tables in non-English documents?

### Considerations
- Column headers in other languages
- Date/number formats vary by locale
- Currency symbols vary
- Type inference patterns may not match

### Options

**Option A: English-first, best effort for others**
- Type inference tuned for English
- May misclassify foreign formats
- Simple to implement

**Option B: Locale detection**
- Detect document language
- Apply locale-specific patterns
- More accurate but complex

**Option C: User-specified locale**
- User indicates document language
- Apply appropriate patterns
- Explicit but adds friction

### Proposed Resolution
**Option A** initially, with pattern expansion for common formats (European dates, currency symbols). Implement **Option B** if user feedback indicates need.

---

## Questions for User Feedback

After initial implementation, gather data on:

1. Average table size in uploaded documents
2. Frequency of mixed-content Excel files
3. Need for cross-document queries
4. Common query patterns (filter vs aggregate vs compare)
5. Languages of uploaded documents
6. Re-upload frequency and expectations

---

## Decision Log

| Date | Question | Decision | Rationale |
|------|----------|----------|-----------|
| TBD | Table size | 10K limit | Cover 90% of cases, evaluate later |
| TBD | Updates | New IDs | Simplicity, training should refresh |
| TBD | Cross-doc | No initially | Complexity, unclear demand |
| TBD | Sandbox | DuckDB + Pyodide | Balance of safety and capability |
| TBD | Formatting | Discard | Focus on data, not presentation |
| TBD | Mixed cells | Store as string | Let sub-agent handle |
| TBD | Formulas | Values only | Most users need values |
| TBD | Ambiguous | LLM review | Accuracy without friction |
| TBD | Sparse | Preserve nulls | Accurate representation |
| TBD | Languages | English-first | Expand based on feedback |
