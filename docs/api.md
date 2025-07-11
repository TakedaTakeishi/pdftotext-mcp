# API Reference

## Overview

PDFtotext MCP provides a single tool for extracting text from PDF files using the reliable `pdftotext` utility.

## Tool: read_pdf_text

### Description
Extracts text content from PDF files with support for page-specific extraction, layout preservation, and multiple encodings.

### Schema
```json
{
  "name": "read_pdf_text",
  "description": "Extract text content from a PDF file using pdftotext from poppler-utils",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Path to the PDF file (relative to current working directory or absolute path)"
      },
      "page": {
        "type": "number",
        "description": "Specific page number to extract (1-based indexing). If not specified, extracts all pages.",
        "minimum": 1
      },
      "layout": {
        "type": "boolean",
        "description": "Preserve original text layout formatting (default: false)",
        "default": false
      },
      "encoding": {
        "type": "string",
        "description": "Text encoding for output (default: UTF-8)",
        "default": "UTF-8",
        "enum": ["UTF-8", "Latin1", "ASCII"]
      }
    },
    "required": ["path"]
  }
}
```

### Parameters

#### path (required)
- **Type**: string
- **Description**: Path to the PDF file to extract text from
- **Examples**: 
  - `"./document.pdf"` (relative path)
  - `"/home/user/documents/report.pdf"` (absolute path)
  - `"../files/presentation.pdf"` (relative parent directory)

#### page (optional)
- **Type**: number
- **Description**: Specific page number to extract (1-based indexing)
- **Default**: Extract all pages
- **Minimum**: 1
- **Examples**: `1`, `5`, `23`

#### layout (optional)
- **Type**: boolean
- **Description**: Whether to preserve the original text layout and formatting
- **Default**: `false`
- **Use cases**: 
  - `true`: For tables, forms, or documents where spatial layout matters
  - `false`: For clean text extraction optimised for reading

#### encoding (optional)
- **Type**: string
- **Description**: Character encoding for the output text
- **Default**: `"UTF-8"`
- **Options**: `"UTF-8"`, `"Latin1"`, `"ASCII"`
- **Use cases**:
  - `"UTF-8"`: Modern documents with international characters
  - `"Latin1"`: Legacy Western European documents
  - `"ASCII"`: Simple English-only documents

### Response Format

#### Success Response
```json
{
  "success": true,
  "file": "document.pdf",
  "path": "/absolute/path/to/document.pdf",
  "directory": "/absolute/path/to",
  "extractedText": "Full extracted text content...",
  "pageSpecific": "all",
  "layoutPreserved": false,
  "encoding": "UTF-8",
  "fileSize": 1048576,
  "lastModified": "2024-01-15T10:30:00.000Z",
  "extractedAt": "2024-01-15T10:35:00.000Z",
  "textLength": 5234,
  "wordCount": 892
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Detailed error message",
  "errorType": "ERROR_TYPE",
  "file": "problematic-file.pdf",
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

### Response Fields

#### Success Fields
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful extractions |
| `file` | string | Base filename of the processed PDF |
| `path` | string | Absolute path to the processed file |
| `directory` | string | Directory containing the file |
| `extractedText` | string | The extracted text content |
| `pageSpecific` | string/number | Page number if specific page, otherwise "all" |
| `layoutPreserved` | boolean | Whether layout was preserved |
| `encoding` | string | Character encoding used |
| `fileSize` | number | File size in bytes |
| `lastModified` | string | ISO timestamp of file modification |
| `extractedAt` | string | ISO timestamp of extraction |
| `textLength` | number | Number of characters in extracted text |
| `wordCount` | number | Approximate word count |

#### Error Fields
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for errors |
| `error` | string | Human-readable error message |
| `errorType` | string | Categorised error type (see below) |
| `file` | string | File that caused the error |
| `timestamp` | string | ISO timestamp of error |

### Error Types

| Error Type | Description | Common Causes |
|------------|-------------|---------------|
| `FILE_NOT_FOUND` | PDF file doesn't exist | Wrong path, file moved/deleted |
| `PERMISSION_DENIED` | Cannot read the file | Insufficient permissions |
| `INVALID_PDF` | File is not a valid PDF | Corrupted file, wrong file type |
| `PDFTOTEXT_ERROR` | pdftotext utility failed | PDF format issues, encrypted PDF |
| `UNKNOWN_ERROR` | Unexpected error occurred | System issues, memory problems |

### Examples

#### Extract entire document
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./annual-report.pdf"
  }
}
```

#### Extract page 3 with layout preservation
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "/documents/financial-table.pdf",
    "page": 3,
    "layout": true
  }
}
```

#### Extract with Latin1 encoding
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./legacy-document.pdf",
    "encoding": "Latin1"
  }
}
```

## Implementation Notes

### Performance
- Processing time depends on PDF size and complexity
- 30-second timeout for very large files
- 50MB buffer limit for text output

### Security
- File path validation prevents directory traversal
- PDF header validation ensures file is actually a PDF
- No external network requests

### Limitations
- Cannot extract text from scanned/image-based PDFs (use OCR tools instead)
- Password-protected PDFs are not supported
- Very large PDFs may hit memory limits
