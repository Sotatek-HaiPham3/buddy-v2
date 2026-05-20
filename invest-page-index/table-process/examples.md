# Examples

End-to-end examples showing inputs, processing, and outputs.

---

## Example 1: CSV File

### Input

**File:** `sales_2023.csv`

```csv
Month,Region,Revenue,Units
Jan,North,125000,500
Jan,South,98000,420
Feb,North,132000,530
Feb,South,105000,450
Mar,North,128000,510
Mar,South,112000,470
```

### Processing

1. **Parse CSV** → Detect comma delimiter, UTF-8 encoding
2. **Header Detection** → First row is header (all strings, second row has numbers)
3. **Type Inference**:
   - Month: string
   - Region: string
   - Revenue: number (currency pattern detected)
   - Units: number
4. **Generate Metadata**:
   - Title: "Sales 2023"
   - Description: "Monthly sales data by region with revenue and unit counts for first quarter 2023"
5. **Store Table** → tableId: `tbl_sales_001`
6. **Generate Tree** → Single node with tableRef

### Output

**PageIndexTree:**
```json
{
  "docName": "sales_2023.csv",
  "docDescription": "Monthly sales data by region for 2023",
  "structure": [{
    "nodeId": "0000",
    "title": "Sales Data 2023",
    "startPage": 1,
    "endPage": 1,
    "summary": "Monthly sales data broken down by North and South regions, including revenue in dollars and units sold. Contains 6 records for January through March 2023.",
    "tableRefs": [{
      "tableId": "tbl_sales_001",
      "position": "inline"
    }],
    "children": []
  }],
  "totalPages": 1,
  "metadata": {
    "mode": "single_table",
    "tocFound": false,
    "processedAt": "2024-01-15T10:30:00Z",
    "model": "csv-processor"
  },
  "tables": ["tbl_sales_001"]
}
```

**Stored Table (AgentTable):**
```json
{
  "tableId": "tbl_sales_001",
  "documentId": "doc-uuid-123",
  "sourceType": "sheet",
  "title": "Sales Data 2023",
  "description": "Monthly sales by region with revenue and units",
  "columnHeaders": ["Month", "Region", "Revenue", "Units"],
  "columnTypes": ["string", "string", "number", "number"],
  "rowCount": 6,
  "columnCount": 4,
  "sampleRows": [
    ["Jan", "North", 125000, 500],
    ["Jan", "South", 98000, 420],
    ["Feb", "North", 132000, 530]
  ],
  "data": [
    ["Jan", "North", 125000, 500],
    ["Jan", "South", 98000, 420],
    ["Feb", "North", 132000, 530],
    ["Feb", "South", 105000, 450],
    ["Mar", "North", 128000, 510],
    ["Mar", "South", 112000, 470]
  ],
  "status": "completed"
}
```

### Chat Interaction

**User:** "Which region had higher revenue overall?"

**Agent sees (from getDocumentStructure):**
```
Document: sales_2023.csv
└── Sales Data 2023 (page 1)
    Contains table "Sales Data 2023" (tbl_sales_001)
    - Columns: Month (string), Region (string), Revenue (number), Units (number)
    - Rows: 6
    - Sample: Jan | North | 125000 | 500
```

**Agent reasoning:**
"I need to sum Revenue by Region. I'll use readTable to query this."

**Tool call:**
```json
{
  "tool": "readTable",
  "tableId": "tbl_sales_001",
  "expectation": "Calculate total revenue by region to determine which had higher overall revenue"
}
```

**Sub-agent generates:**
```sql
SELECT Region, SUM(Revenue) as TotalRevenue
FROM data
GROUP BY Region
ORDER BY TotalRevenue DESC
```

**Result:**
```json
{
  "success": true,
  "result": {
    "type": "aggregation",
    "data": {
      "groups": [
        { "Region": "North", "TotalRevenue": 385000 },
        { "Region": "South", "TotalRevenue": 315000 }
      ]
    },
    "explanation": "North region had higher overall revenue at $385,000 compared to South at $315,000 - a difference of $70,000 (22% higher)."
  },
  "queryExecuted": "SELECT Region, SUM(Revenue) as TotalRevenue..."
}
```

**Agent response:**
"The **North region** had higher overall revenue at **$385,000**, compared to South at $315,000. That's $70,000 more, or about 22% higher."

---

## Example 2: Excel with Mixed Content

### Input

**File:** `quarterly_report.xlsx`

**Sheet 1: "Summary"**
```
A1 (merged A1:F1, bold, large font): "Q3 2023 Financial Report"
A2: (empty)
A3:A10:
  "This quarter showed strong performance despite market headwinds.
   Revenue grew 15% year-over-year, exceeding analyst expectations.
   Key highlights include expansion in the West region and
   successful product launches in the enterprise segment."

A12 (bold): "Key Metrics"
A13:D20:
  | Metric    | Q2 2023 | Q3 2023 | Change |
  | Revenue   | $1.8M   | $2.1M   | +16.7% |
  | Costs     | $1.2M   | $1.3M   | +8.3%  |
  | Profit    | $600K   | $800K   | +33.3% |
  | Margin    | 33%     | 38%     | +5pts  |
```

**Sheet 2: "Details"**
```
A1:F100:
  | Month | Region | Product | Revenue | Units | Margin |
  | Jul   | North  | Widget  | 150000  | 600   | 35%    |
  | Jul   | North  | Gadget  | 120000  | 400   | 40%    |
  | Jul   | South  | Widget  | 130000  | 520   | 32%    |
  ... (97 more rows)
```

### Processing

**Sheet 1 Processing:**
1. **Zone Detection:**
   - Region A1:F1 → HEADER (merged, bold, large font)
   - Region A3:A10 → TEXT (long sentences)
   - Region A12:A12 → HEADER (bold, precedes table)
   - Region A13:D20 → TABLE (consistent columns, mixed types)

2. **Zone Classification Results:**
   ```
   [
     { type: "header", range: "A1:F1", content: "Q3 2023 Financial Report" },
     { type: "text", range: "A3:A10", content: "This quarter showed..." },
     { type: "header", range: "A12", content: "Key Metrics", associatedWith: "A13:D20" },
     { type: "table", range: "A13:D20", tableId: "tbl_metrics_001" }
   ]
   ```

3. **Table Extraction (A13:D20):**
   - Headers: ["Metric", "Q2 2023", "Q3 2023", "Change"]
   - Types: [string, currency, currency, percentage]
   - Rows: 4
   - tableId: `tbl_metrics_001`

**Sheet 2 Processing:**
1. **Zone Detection:** Single table region A1:F100
2. **Table Extraction:**
   - Headers: ["Month", "Region", "Product", "Revenue", "Units", "Margin"]
   - Types: [string, string, string, number, number, percentage]
   - Rows: 100
   - tableId: `tbl_details_001`

### Output

**PageIndexTree:**
```json
{
  "docName": "quarterly_report.xlsx",
  "docDescription": "Q3 2023 financial report with summary and detailed transaction data",
  "structure": [
    {
      "nodeId": "0000",
      "title": "Summary",
      "startPage": 1,
      "endPage": 1,
      "summary": "Q3 2023 Financial Report executive summary showing 15% YoY revenue growth and strong performance. Contains overview text and key metrics table.",
      "children": [
        {
          "nodeId": "0001",
          "title": "Executive Summary",
          "startPage": 1,
          "endPage": 1,
          "summary": "Quarterly performance overview noting 15% YoY revenue growth, market outperformance, West region expansion, and enterprise product launches.",
          "tableRefs": [],
          "children": []
        },
        {
          "nodeId": "0002",
          "title": "Key Metrics",
          "startPage": 1,
          "endPage": 1,
          "summary": "Financial metrics comparison table showing Q2 vs Q3 2023 with revenue, costs, profit, and margin changes.",
          "tableRefs": [{
            "tableId": "tbl_metrics_001",
            "position": "inline"
          }],
          "children": []
        }
      ],
      "tableRefs": []
    },
    {
      "nodeId": "0010",
      "title": "Details",
      "startPage": 2,
      "endPage": 2,
      "summary": "Detailed transaction data by month, region, and product. Contains 100 records with revenue, units, and margin for Q3 2023.",
      "tableRefs": [{
        "tableId": "tbl_details_001",
        "position": "inline"
      }],
      "children": []
    }
  ],
  "totalPages": 2,
  "metadata": {
    "mode": "excel_multi_sheet",
    "tocFound": false,
    "processedAt": "2024-01-15T10:35:00Z",
    "model": "excel-processor"
  },
  "tables": ["tbl_metrics_001", "tbl_details_001"]
}
```

### Chat Interaction

**User:** "How did profit margin change from Q2 to Q3?"

**Agent sees (from listDocuments):**
```
Document: quarterly_report.xlsx
Tables:
- tbl_metrics_001: "Key Metrics" (4 cols, 4 rows)
  Columns: Metric, Q2 2023, Q3 2023, Change
- tbl_details_001: "Details" (6 cols, 100 rows)
  Columns: Month, Region, Product, Revenue, Units, Margin
```

**Agent reasoning:**
"The metrics table has exactly what I need - Q2 vs Q3 comparison including margin."

**Tool call:**
```json
{
  "tool": "readTable",
  "tableId": "tbl_metrics_001",
  "expectation": "Find the profit margin values for Q2 and Q3 and their change"
}
```

**Result:**
```json
{
  "success": true,
  "result": {
    "type": "row",
    "data": { "Metric": "Margin", "Q2 2023": "33%", "Q3 2023": "38%", "Change": "+5pts" },
    "explanation": "Profit margin improved from 33% in Q2 to 38% in Q3, an increase of 5 percentage points."
  }
}
```

**Agent response:**
"Profit margin **improved by 5 percentage points**, going from 33% in Q2 2023 to 38% in Q3 2023. This represents a significant improvement in profitability during the quarter."

---

## Example 3: PDF with Embedded Tables

### Input

**File:** `annual_report.pdf` (10 pages)

```
Page 1: Title page
Page 2: Table of Contents
Page 3-4: Executive Summary (text)
Page 5: Financial Highlights
  - Paragraph of text
  - Table: Revenue by Segment (4 rows)
  - Paragraph of analysis
Page 6-7: Detailed Financials
  - Table: Income Statement (15 rows)
  - Table: Balance Sheet (20 rows)
Page 8-10: Notes and Appendix (text)
```

### Processing

1. **OCR with Table Detection:**
   - Page 5: Table detected at coords (100, 400, 500, 600)
   - Page 6: Table detected at coords (50, 100, 550, 500)
   - Page 7: Table detected at coords (50, 100, 550, 600)

2. **Table Extraction:**
   - Page 5 table → `tbl_revenue_seg` (4 rows)
   - Page 6 table → `tbl_income_stmt` (15 rows)
   - Page 7 table → `tbl_balance_sheet` (20 rows)

3. **Content with Markers:**
   ```
   <page_5>
   Financial Highlights

   Our diversified revenue streams continued to show strength...

   [[TABLE:tbl_revenue_seg]]

   As the table demonstrates, the Enterprise segment grew...
   </page_5>

   <page_6>
   Detailed Financials

   [[TABLE:tbl_income_stmt]]
   </page_6>

   <page_7>
   [[TABLE:tbl_balance_sheet]]
   </page_7>
   ```

4. **PageIndex Processing:**
   - TOC detected on page 2
   - Tree built with sections
   - Table markers preserved in nodes

5. **Reference Resolution:**
   - Scan nodes for `[[TABLE:xxx]]`
   - Add tableRefs to appropriate nodes

### Output

**PageIndexTree (relevant portion):**
```json
{
  "structure": [
    {
      "nodeId": "0003",
      "title": "Financial Highlights",
      "startPage": 5,
      "endPage": 5,
      "summary": "Overview of financial performance with revenue breakdown by segment table. Enterprise segment showed 25% growth.",
      "tableRefs": [{
        "tableId": "tbl_revenue_seg",
        "position": "inline"
      }],
      "children": []
    },
    {
      "nodeId": "0004",
      "title": "Detailed Financials",
      "startPage": 6,
      "endPage": 7,
      "summary": "Complete financial statements including income statement and balance sheet tables.",
      "tableRefs": [
        { "tableId": "tbl_income_stmt", "position": "inline" },
        { "tableId": "tbl_balance_sheet", "position": "inline" }
      ],
      "children": []
    }
  ],
  "tables": ["tbl_revenue_seg", "tbl_income_stmt", "tbl_balance_sheet"]
}
```

### Content Retrieval (Page 5)

When agent calls `retrieveDocumentPages("doc-id", 5, 5)`:

```
--- Page 5 ---
Financial Highlights

Our diversified revenue streams continued to show strength across all segments. The following breakdown illustrates our revenue distribution:

[Table: "Revenue by Segment" - tbl_revenue_seg]
Columns: Segment, Revenue, YoY Growth, % of Total
Rows: 4
Use readTable("tbl_revenue_seg", "your question") to query this data.

As the table demonstrates, the Enterprise segment grew by 25% year-over-year, now representing 45% of total revenue. Consumer segment remained stable at 30%, while our new Cloud Services segment exceeded expectations...
```

The agent sees the table context but not raw data, and knows to use `readTable` to query it.

---

## Example 4: Complex Query Interaction

### Setup

Document has table `tbl_transactions` with 500 rows:
- Columns: Date, Customer, Product, Amount, Region, SalesRep

### User Query

"Find our top 5 sales reps by total sales in the West region for Q3"

### Agent Flow

**Step 1: Agent sees table metadata**
```
Table: "Sales Transactions" (tbl_transactions)
- Columns: Date (date), Customer (string), Product (string),
           Amount (currency), Region (string), SalesRep (string)
- Rows: 500
- Sample: 2023-07-15 | Acme Corp | Widget Pro | $5,000 | West | John Smith
```

**Step 2: Agent reasons**
"I need to:
1. Filter for West region
2. Filter for Q3 dates (July-September)
3. Sum Amount by SalesRep
4. Sort descending, limit 5"

**Step 3: Tool call**
```json
{
  "tool": "readTable",
  "tableId": "tbl_transactions",
  "expectation": "Find top 5 sales representatives by total sales amount in West region for Q3 (July-September 2023)",
  "columns": ["SalesRep", "Amount", "Region", "Date"],
  "filters": "West region only, Q3 2023 only"
}
```

**Step 4: Sub-agent processing**

Sub-agent receives:
- Table metadata
- Full data (500 rows)
- Expectation
- Hints

Sub-agent generates:
```sql
SELECT
  SalesRep,
  SUM(Amount) as TotalSales,
  COUNT(*) as DealCount
FROM data
WHERE Region = 'West'
  AND Date >= '2023-07-01'
  AND Date <= '2023-09-30'
GROUP BY SalesRep
ORDER BY TotalSales DESC
LIMIT 5
```

Sub-agent executes and formats:
```json
{
  "type": "rows",
  "data": [
    { "SalesRep": "Sarah Johnson", "TotalSales": 125000, "DealCount": 28 },
    { "SalesRep": "Mike Chen", "TotalSales": 98000, "DealCount": 22 },
    { "SalesRep": "Emily Brown", "TotalSales": 87500, "DealCount": 19 },
    { "SalesRep": "David Kim", "TotalSales": 76000, "DealCount": 17 },
    { "SalesRep": "Lisa Wang", "TotalSales": 72000, "DealCount": 15 }
  ],
  "explanation": "Sarah Johnson leads West region Q3 sales with $125K across 28 deals, followed by Mike Chen with $98K. The top 5 reps account for $458.5K in total sales."
}
```

**Step 5: Agent response**

"Here are the **top 5 sales reps** in the West region for Q3 2023:

| Rank | Sales Rep | Total Sales | Deals |
|------|-----------|-------------|-------|
| 1 | Sarah Johnson | $125,000 | 28 |
| 2 | Mike Chen | $98,000 | 22 |
| 3 | Emily Brown | $87,500 | 19 |
| 4 | David Kim | $76,000 | 17 |
| 5 | Lisa Wang | $72,000 | 15 |

Sarah Johnson leads with $125K in total sales across 28 deals. The top 5 reps together closed $458,500 in the West region during Q3."

---

## Example 5: Error Handling

### Query with Invalid Column

**User:** "What's the average quantity sold?"

**Agent calls:**
```json
{
  "tool": "readTable",
  "tableId": "tbl_sales_001",
  "expectation": "Calculate average quantity sold"
}
```

**Result:**
```json
{
  "success": false,
  "error": "Column 'quantity' not found. Available columns: Month, Region, Revenue, Units. Did you mean 'Units'?"
}
```

**Agent response:**
"I couldn't find a 'quantity' column in the sales data. The available columns are Month, Region, Revenue, and Units. Would you like me to calculate the average **Units** sold instead?"

### Query on Large Table Without Filters

**User:** "List all transactions"

**Agent calls:**
```json
{
  "tool": "readTable",
  "tableId": "tbl_large_data",
  "expectation": "List all transactions"
}
```

**Result:**
```json
{
  "success": false,
  "error": "Table has 50,000 rows. Please specify filters to narrow down the results. Suggestions: filter by date range, region, or customer."
}
```

**Agent response:**
"The transaction table has 50,000 rows, which is too large to display in full. Could you narrow down your request? For example:
- Transactions from a specific month
- Transactions for a particular region
- Transactions above a certain amount"
