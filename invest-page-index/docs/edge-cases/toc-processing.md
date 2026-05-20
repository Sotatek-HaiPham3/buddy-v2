# Edge Cases: TOC Processing

## Case 1: Fuzzy Title Matching

All title verification prompts explicitly tell LLM to use fuzzy matching:

```
Note: do fuzzy matching, ignore any space inconsistency in the page_text.
```

This handles cases where:
- PDF extraction adds extra spaces
- Section titles have inconsistent formatting
- Minor OCR errors in scanned documents

## Case 11: TOC Content Whitespace Check

TOC content must be non-empty AND not just whitespace:

```python
if check_toc_result.get("toc_content") and check_toc_result["toc_content"].strip() and ...:
    # Process with TOC
else:
    # Fall back to no-TOC processing
```

## Case 22: TOC Detection Beyond Max Pages

Continues scanning beyond `toc_check_page_num` if actively finding TOC pages:

```python
while i < len(page_list):
    # Only stop if we're past max AND not currently finding TOC
    if i >= opt.toc_check_page_num and not last_page_is_yes:
        break
```

This ensures multi-page TOCs are fully captured even if they extend beyond the default 20-page scan limit.

## Case 34: TOC Without Page Numbers → Direct to No-TOC Mode

**Important Flow Detail:** When TOC is found but has NO page numbers, it goes DIRECTLY to `process_no_toc`, NOT to `process_toc_no_page_numbers`:

```python
# In tree_parser
if toc_content AND toc_content.strip() AND page_index_given_in_toc == "yes":
    mode = 'process_toc_with_page_numbers'
else:
    mode = 'process_no_toc'  # Skips process_toc_no_page_numbers!
```

`process_toc_no_page_numbers` is ONLY used as a fallback when `process_toc_with_page_numbers` fails (accuracy ≤ 60%).

## Case 35: Multiple TOC Search Limit

The search for additional TOCs (when first TOC has no page numbers) is limited:

```python
while (toc_json['page_index_given_in_toc'] == 'no' and
       current_start_index < len(page_list) and
       current_start_index < opt.toc_check_page_num):  # ← This limit!
```

Search stops at `toc_check_page_num` (default 20) pages.

## Multiple TOC Search

If the first TOC found has no page numbers, the system searches for additional TOCs:

```python
def check_toc(page_list, opt):
    toc_page_list = find_toc_pages(start_page_index=0, page_list, opt)

    if len(toc_page_list) == 0:
        return {'toc_content': None, 'page_index_given_in_toc': 'no'}

    toc_json = toc_extractor(page_list, toc_page_list, opt.model)

    if toc_json['page_index_given_in_toc'] == 'yes':
        return toc_json

    # TOC found but no page numbers - search for more TOCs
    current_start_index = toc_page_list[-1] + 1

    while toc_json['page_index_given_in_toc'] == 'no':
        additional_toc_pages = find_toc_pages(start_page_index=current_start_index, ...)

        if len(additional_toc_pages) == 0:
            break

        additional_toc = toc_extractor(page_list, additional_toc_pages, ...)
        if additional_toc['page_index_given_in_toc'] == 'yes':
            return additional_toc  # Found TOC with page numbers!

        current_start_index = additional_toc_pages[-1] + 1
```

**Why this is needed:**
- Some documents have multiple TOCs (e.g., brief TOC + detailed TOC)
- Brief TOC might not have page numbers, detailed TOC does
- System keeps searching until it finds a TOC with page numbers or exhausts options
