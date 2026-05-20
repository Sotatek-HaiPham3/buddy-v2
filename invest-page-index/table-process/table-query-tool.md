# Table Query Tool Design

## Overview

The table query system uses a two-level pattern:
1. **Master Agent** - Sees table metadata, decides which table to query
2. **Table Query Sub-Agent** - Executes queries against actual data

This keeps raw table data out of main context while enabling accurate queries.

## Master Agent Tool: `readTable`

### Interface

```typescript
interface ReadTableInput {
  tableId: string
  expectation: string  // Natural language: what does the agent want to know?

  // Optional hints
  columns?: string[]   // Specific columns of interest
  filters?: string     // Natural language filter description
}

interface ReadTableOutput {
  success: boolean
  error?: string

  // Query results
  result?: {
    type: "value" | "row" | "rows" | "aggregation" | "comparison"
    data: any
    explanation: string
  }

  // For debugging/transparency
  queryExecuted?: string
  rowsScanned?: number
  executionTime?: number
}
```

### Example Usage

```typescript
// Master agent calls:
const result = await readTable({
  tableId: "tbl_sales_001",
  expectation: "Find the month with highest revenue in 2023",
  columns: ["Month", "Revenue"]
})

// Returns:
{
  success: true,
  result: {
    type: "row",
    data: { Month: "November", Revenue: 2100000 },
    explanation: "November 2023 had the highest revenue at $2.1M, 15% higher than the second-highest month (August at $1.83M)."
  },
  queryExecuted: "SELECT Month, Revenue FROM table ORDER BY Revenue DESC LIMIT 1",
  rowsScanned: 24
}
```

## Table Query Sub-Agent

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Table Query Sub-Agent                                        │
│                                                             │
│ INPUT:                                                      │
│ - Table metadata (columns, types, row count)                │
│ - Table data (full or filtered subset)                      │
│ - Expectation from master agent                             │
│ - Optional column/filter hints                              │
│                                                             │
│ PROCESS:                                                    │
│ 1. Analyze expectation                                      │
│ 2. Generate query (SQL or code)                             │
│ 3. Execute in sandbox                                       │
│ 4. Format result                                            │
│ 5. Generate explanation                                     │
│                                                             │
│ OUTPUT:                                                     │
│ - Structured result with type                               │
│ - Natural language explanation                              │
│ - Query for transparency                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sub-Agent Prompt

```
You are a data query specialist. Given a table and a question, generate and execute a query to answer it.

## Table Information
Name: {{tableName}}
Columns: {{columns with types}}
Row Count: {{rowCount}}
Sample Data:
{{first 3 rows}}

## User's Question
{{expectation}}

## Your Task
1. Analyze what data is needed to answer the question
2. Generate a SQL query or pandas code
3. The query will be executed automatically
4. Explain the result in plain language

## Query Guidelines
- Use SQL-like syntax for simple queries
- For complex analysis, use pandas operations
- Always handle NULL/missing values
- Include relevant context in explanation

## Response Format
```json
{
  "query": "SELECT ... or df[...]",
  "queryType": "sql" | "pandas",
  "resultType": "value" | "row" | "rows" | "aggregation" | "comparison",
  "explanation": "Natural language explanation of result"
}
```
```

### Query Execution Engine

```typescript
interface QueryEngine {
  executeSql(query: string, data: any[][]): QueryResult
  executePandas(code: string, data: any[][]): QueryResult
}

// SQL execution using DuckDB (in-memory, safe)
async function executeSql(
  query: string,
  columns: string[],
  data: any[][]
): Promise<any> {
  const db = await duckdb.connect()

  // Create table from data
  await db.exec(`
    CREATE TABLE data (
      ${columns.map((c, i) => `"${c}" ${inferDuckDbType(data, i)}`).join(', ')}
    )
  `)

  // Insert data
  for (const row of data) {
    await db.exec(`INSERT INTO data VALUES (${row.map(v => formatValue(v)).join(', ')})`)
  }

  // Execute query
  const result = await db.query(query)
  return result.toArray()
}

// Pandas execution in sandboxed environment
async function executePandas(
  code: string,
  columns: string[],
  data: any[][]
): Promise<any> {
  // Use isolated Python subprocess or Pyodide
  const pythonCode = `
import pandas as pd
import json

# Load data
df = pd.DataFrame(${JSON.stringify(data)}, columns=${JSON.stringify(columns)})

# Execute user code
result = ${code}

# Serialize result
print(json.dumps(result.to_dict() if hasattr(result, 'to_dict') else result))
  `

  return await executePythonSandboxed(pythonCode)
}
```

## Result Types

### Value Result
Single value answer.

```typescript
{
  type: "value",
  data: 2100000,
  explanation: "Total revenue for Q3 was $2.1M"
}
```

### Row Result
Single row with multiple columns.

```typescript
{
  type: "row",
  data: { Month: "November", Revenue: 2100000, Growth: "15%" },
  explanation: "November had the highest revenue..."
}
```

### Rows Result
Multiple rows (limited to top N).

```typescript
{
  type: "rows",
  data: [
    { Month: "November", Revenue: 2100000 },
    { Month: "August", Revenue: 1830000 },
    { Month: "September", Revenue: 1750000 }
  ],
  explanation: "Top 3 months by revenue..."
}
```

### Aggregation Result
Grouped/summarized data.

```typescript
{
  type: "aggregation",
  data: {
    groups: [
      { Region: "North", TotalRevenue: 5200000 },
      { Region: "South", TotalRevenue: 4100000 }
    ],
    summary: { TotalRevenue: 9300000 }
  },
  explanation: "Revenue by region shows North leading..."
}
```

### Comparison Result
Comparative analysis.

```typescript
{
  type: "comparison",
  data: {
    items: [
      { name: "Q2 vs Q1", change: "+12%", absolute: 150000 },
      { name: "Q3 vs Q2", change: "+8%", absolute: 110000 }
    ],
    trend: "increasing"
  },
  explanation: "Quarter-over-quarter growth is positive but slowing..."
}
```

## What Master Agent Sees

When listing documents/structure, master agent sees:

```
Table: "Monthly Sales" (tbl_001)
├── Columns: Month (date), Region (string), Revenue (currency), Units (number)
├── Rows: 36
├── Sample:
│   Jan 2023 | North | $125,000 | 500
│   Jan 2023 | South | $98,000  | 420
│   Feb 2023 | North | $132,000 | 530
└── Query with: readTable("tbl_001", "your question about sales data")
```

This lets the agent:
1. Understand what data exists
2. Know column names/types for forming questions
3. See sample values to understand data format
4. NOT see all 36 rows (saves context)

## Flow Example

**User:** "Which region performed best in Q3?"

**Master Agent Reasoning:**
```
Looking at available tables:
- "Monthly Sales" (tbl_001) has Region and Revenue columns
- Data covers Jan-Dec 2023

I need to find revenue by region for Q3 (Jul-Sep).
```

**Tool Call:**
```json
{
  "tool": "readTable",
  "input": {
    "tableId": "tbl_001",
    "expectation": "Find which region had the highest total revenue in Q3 (July, August, September)",
    "columns": ["Region", "Revenue", "Month"]
  }
}
```

**Sub-Agent Processing:**
```
Query generated:
SELECT Region, SUM(Revenue) as TotalRevenue
FROM data
WHERE Month IN ('Jul 2023', 'Aug 2023', 'Sep 2023')
GROUP BY Region
ORDER BY TotalRevenue DESC
LIMIT 1

Result: { Region: "North", TotalRevenue: 425000 }
```

**Tool Response:**
```json
{
  "success": true,
  "result": {
    "type": "aggregation",
    "data": {
      "groups": [
        { "Region": "North", "TotalRevenue": 425000 },
        { "Region": "South", "TotalRevenue": 312000 },
        { "Region": "West", "TotalRevenue": 289000 }
      ]
    },
    "explanation": "North region performed best in Q3 with $425K total revenue, 36% higher than South ($312K) and 47% higher than West ($289K)."
  },
  "queryExecuted": "SELECT Region, SUM(Revenue)...",
  "rowsScanned": 9
}
```

**Master Agent Response:**
"Based on the sales data, the **North region** performed best in Q3 with $425,000 in total revenue. This was 36% higher than the South region ($312K) and 47% higher than the West region ($289K)."

## Error Handling

```typescript
{
  success: false,
  error: "Column 'Quantity' not found. Available columns: Month, Region, Revenue, Units"
}

{
  success: false,
  error: "Query timeout: Table has 50,000 rows. Please add filters to narrow down."
}

{
  success: false,
  error: "Ambiguous request: Did you mean total revenue or average revenue per month?"
}
```

## Large Table Handling

For tables with >10,000 rows:

```typescript
async function handleLargeTable(
  tableId: string,
  expectation: string,
  filters?: string
): Promise<ReadTableOutput> {
  const metadata = await getTableMetadata(tableId)

  if (metadata.rowCount > 10000 && !filters) {
    // Ask sub-agent to suggest filters first
    const filterSuggestion = await suggestFilters(metadata, expectation)

    return {
      success: false,
      error: `Table has ${metadata.rowCount} rows. Please specify filters. Suggestions: ${filterSuggestion}`
    }
  }

  // If filters provided, apply them before sending to sub-agent
  const filteredData = await applyFilters(tableId, filters)
  return executeQuery(filteredData, expectation)
}
```

## Security Considerations

1. **SQL Injection Prevention**
   - Use DuckDB's parameterized queries
   - Validate column names against schema
   - Limit query complexity

2. **Code Execution Sandboxing**
   - Run pandas code in isolated subprocess
   - No network access
   - No file system access
   - Timeout enforcement

3. **Resource Limits**
   - Max 10,000 rows per query
   - Query timeout: 30 seconds
   - Memory limit per query
