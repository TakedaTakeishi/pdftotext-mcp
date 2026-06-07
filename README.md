# PDFtotext MCP Server

A **reliable** Model Context Protocol (MCP) server for PDF text extraction using the proven `pdftotext` utility from poppler-utils.

[![npm version](https://badge.fury.io/js/pdftotext-mcp.svg)](https://badge.fury.io/js/pdftotext-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Why This Server?

Unlike other PDF MCP servers that suffer from logging interference, complex dependencies, and reliability issues, `pdftotext-mcp` is:

- ✅ **Actually works** - Clean JSON-RPC communication without stdout pollution
- ✅ **Reliable** - Built on mature `pdftotext` from poppler-utils (used by millions)
- ✅ **Lightweight** - Minimal dependencies, maximum compatibility
- ✅ **Production tested** - Successfully tested with Claude Desktop and other MCP clients
- ✅ **Feature complete** - Page-specific extraction, layout preservation, encoding options
- ✅ **Error handling** - Comprehensive validation and helpful error messages
- ✅ **Enhanced** - Smart caching, book-page offsets, clean mode, chapter detection (see Features)

## 📋 Features

- 📄 Extract text from entire PDF documents or specific pages
- 🎨 Preserve original layout formatting (optional)
- 🔤 Multiple text encoding support (UTF-8, Latin1, ASCII)
- 📊 Comprehensive metadata in responses (word count, file info, etc.)
- 🛡️ File validation and security checks
- ⚡ Fast processing with configurable timeouts
- 🔍 Detailed error reporting with troubleshooting hints
- 💾 **LRU cache** (configurable, max 5 files) — automatically reuses results when the same PDF+query is requested again
- 📏 **Offset-aware page selection** — pass `offset` from `get_pdf_info` to map book page numbers to PDF pages
- 🧹 **Clean extraction** — `clean: true` removes standalone page numbers, short headers, and repeated decoration characters
- 📖 **Chapter metadata** — `chapterInRange` returns `{ number, title }` when a chapter heading is detected near the extracted content
- 🌐 **Multi-language chapter detection** — supports English and Spanish headings (Chapter/Capítulo, Part/Parte, Lesson/Lección, etc.)
- 📐 **Page offset estimation** — `get_pdf_info` returns `pageOffset` (front matter pages before content) with fallback instructions when detection fails

## 🔧 Prerequisites

You must have `pdftotext` installed on your system:

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install poppler-utils
```

### macOS
```bash
brew install poppler
```

### Windows
```bash
# Using Chocolatey
choco install poppler

# Using Scoop
scoop install poppler
```

### Verify Installation
```bash
pdftotext -v
```

## 📦 Installation

### Option 1: Global Installation (Recommended)
```bash
npm install -g pdftotext-mcp
```

### Option 2: Use with npx (No Installation)
```bash
npx pdftotext-mcp
```

### Option 3: Local Development
```bash
git clone https://github.com/jpwebb/pdftotext-mcp.git
cd pdftotext-mcp
npm install
npm start
```

## ⚙️ Configuration

Add to your MCP client configuration:

### Claude Desktop
Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pdftotext": {
      "command": "pdftotext-mcp"
    }
  }
}
```

Or with npx:
```json
{
  "mcpServers": {
    "pdftotext": {
      "command": "npx",
      "args": ["pdftotext-mcp"]
    }
  }
}
```

### Other MCP Clients
The server works with any MCP-compatible client. Use `pdftotext-mcp` as the command.

## 🎯 Usage

The server provides a single, powerful tool: **`read_pdf_text`**

### Basic Usage

#### Extract entire document
```javascript
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./document.pdf"
  }
}
```

#### Extract specific page
```javascript
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./document.pdf",
    "page": 2
  }
}
```

#### Preserve layout formatting
```javascript
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./document.pdf",
    "layout": true
  }
}
```

#### Custom encoding
```javascript
{
  "tool": "read_pdf_text",
  "arguments": {
    "path": "./document.pdf",
    "encoding": "Latin1"
  }
}
```

### Response Format

#### Success Response
```json
{
  "success": true,
  "file": "document.pdf",
  "path": "/absolute/path/to/document.pdf",
  "extractedText": "Full text content...",
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
  "error": "File not found: ./nonexistent.pdf",
  "errorType": "FILE_NOT_FOUND",
  "file": "./nonexistent.pdf",
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

## 📚 API Reference

### Tool: `read_pdf_text`

Extracts text content from PDF files using pdftotext.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | ✅ | - | Path to PDF file (relative or absolute) |
| `page` | number | ❌ | all pages | Specific page to extract (1-based) |
| `layout` | boolean | ❌ | `false` | Preserve original text layout |
| `encoding` | string | ❌ | `"UTF-8"` | Output text encoding |

#### Supported Encodings
- `UTF-8` (default)
- `Latin1`
- `ASCII`

#### Error Types
- `FILE_NOT_FOUND` - PDF file doesn't exist
- `PERMISSION_DENIED` - Cannot read the file
- `INVALID_PDF` - File is not a valid PDF
- `PDFTOTEXT_ERROR` - pdftotext utility error
- `UNKNOWN_ERROR` - Unexpected error

## 🔧 Troubleshooting

### "pdftotext is not available"
**Solution**: Install poppler-utils (see [Prerequisites](#-prerequisites))

### "File not found"
**Solutions**:
- Use absolute paths: `/home/user/document.pdf`
- Check file exists: `ls -la /path/to/file.pdf`
- Verify MCP server working directory

### "Permission denied"
**Solutions**:
- Check file permissions: `chmod 644 document.pdf`
- Ensure directory is readable: `chmod 755 /path/to/directory/`

### "File is not a valid PDF"
**Solutions**:
- Verify file is actually a PDF: `file document.pdf`
- Check for file corruption
- Try with a different PDF file

### MCP Connection Issues
**Solutions**:
- Restart your MCP client completely
- Check configuration syntax in config file
- Verify `pdftotext-mcp` is accessible in PATH
- Check MCP client logs for detailed errors

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with watch mode
npm run test:watch

# Run linter
npm run lint
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
```bash
git clone https://github.com/jpwebb/pdftotext-mcp.git
cd pdftotext-mcp
npm install
```

### Running Locally
```bash
npm start
```

### Code Style
This project uses ESLint. Run `npm run lint` to check code style.

## 📄 License

[MIT](LICENSE) - see LICENSE file for details.

## 🙏 Acknowledgments

- Built for the [Model Context Protocol](https://modelcontextprotocol.io/) ecosystem
- Uses [poppler-utils](https://poppler.freedesktop.org/) `pdftotext` utility
- Inspired by the need for reliable PDF processing in MCP environments

## 🔗 Related

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/docs)
- [Claude Desktop MCP Configuration](https://docs.anthropic.com/en/docs/build-with-claude/computer-use#mcp)
- [Poppler Utils Documentation](https://poppler.freedesktop.org/)

---

**Made for the MCP community**