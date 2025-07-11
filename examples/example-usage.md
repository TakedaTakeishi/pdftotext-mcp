# PDFtotext MCP Usage Examples

## Basic Text Extraction

### Extract all text from a PDF
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./resume.pdf"
  }
}
```

### Extract text from page 2 only
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./report.pdf",
    "page": 2
  }
}
```

### Extract with layout preservation
```json
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./table-document.pdf",
    "layout": true
  }
}
```

## Advanced Examples

### Multi-document processing workflow
1. Extract text from multiple PDFs
2. Compare content between documents
3. Analyse specific sections

### Document analysis workflow
1. Extract metadata and text
2. Count words and characters
3. Identify key sections or topics

## Configuration Examples

### Global installation
```bash
npm install -g pdftotext-mcp
```

### Claude Desktop config
```json
{
  "mcpServers": {
    "pdftotext": {
      "command": "pdftotext-mcp"
    }
  }
}
```

### Development setup
```bash
git clone https://github.com/jwebb85/pdftotext-mcp.git
cd pdftotext-mcp
npm install
npm start
```
