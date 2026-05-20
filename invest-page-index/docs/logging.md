# Logging System

PageIndex uses a JSON-based logger that records all processing steps for debugging and analysis.

## JsonLogger Class

```python
class JsonLogger:
    def __init__(self, file_path):
        pdf_name = get_pdf_name(file_path)
        current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.filename = f"{pdf_name}_{current_time}.json"
        os.makedirs("./logs", exist_ok=True)
        self.log_data = []

    def info(self, message):
        self.log_data.append(message)
        with open(self._filepath(), "w") as f:
            json.dump(self.log_data, f, indent=2)
```

## Log Output Location

```
./logs/{pdf_name}_{timestamp}.json
```

Example: `./logs/annual-report-2023_20240115_143022.json`

## What's Logged

| Event | Data Logged |
|-------|-------------|
| PDF Extraction | Total page count, total token count |
| TOC Detection | TOC page indices found, TOC content |
| Page Number Detection | Whether TOC has page numbers |
| TOC Transformation | JSON structure result |
| Physical Page Mapping | Offset calculated, mapped entries |
| Verification | Accuracy percentage, incorrect results |
| Fix Attempts | Each fix attempt, success/failure |
| Split Operations | Nodes split, new children created |
| Summary Generation | Summaries generated per node |

## Log Format

```json
[
  "Total pages: 50",
  "Total tokens: 125000",
  "TOC pages found: [2, 3]",
  "TOC has page numbers: yes",
  "Calculated offset: 4",
  "Verification accuracy: 85%",
  "Incorrect entries: ['Section 3.2', 'Section 5.1']",
  "Fix attempt 1: Section 3.2 fixed",
  "Fix attempt 2: Section 5.1 fixed",
  "Final accuracy: 100%",
  "Nodes split: 2",
  "Summaries generated: 15"
]
```

## Usage in Code

```python
# Logger is created per PDF
logger = JsonLogger(pdf_path)

# Log processing steps
logger.info(f"Total pages: {len(page_list)}")
logger.info(f"TOC pages found: {toc_page_list}")
logger.info(f"Verification accuracy: {accuracy*100:.0f}%")

# Log errors
logger.info(f"Error processing {item['title']}: {str(e)}")
```

## Standard Python Logging

In addition to JsonLogger, standard Python logging is used for errors:

```python
import logging

logging.error(f"Error: {e}")
logging.error('Max retries reached')
```

These go to stderr and can be captured by the application's logging configuration.

## Debugging Tips

1. **Check log file** after processing to understand the pipeline flow
2. **Look for accuracy** to understand if fallback was triggered
3. **Check fix attempts** to see if entries were corrected
4. **Review incorrect results** to understand what mappings failed
