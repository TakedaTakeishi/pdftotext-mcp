# Installation Guide

## Prerequisites

Before installing pdftotext-mcp, you need to have `pdftotext` available on your system.

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install poppler-utils
```

### macOS
Using Homebrew:
```bash
brew install poppler
```

Using MacPorts:
```bash
sudo port install poppler
```

### Windows

#### Using Chocolatey
```bash
choco install poppler
```

#### Using Scoop
```bash
scoop install poppler
```

#### Manual Installation
1. Download poppler for Windows from: https://github.com/oschwartz10612/poppler-windows/releases
2. Extract to a directory (e.g., `C:\poppler`)
3. Add `C:\poppler\bin` to your PATH environment variable

### Verify Installation
```bash
pdftotext -v
```

You should see version information for pdftotext.

## Installing PDFtotext MCP

### Method 1: Global Installation (Recommended)
```bash
npm install -g pdftotext-mcp
```

This makes `pdftotext-mcp` available globally on your system.

### Method 2: Local Installation
```bash
npm install pdftotext-mcp
```

Run with: `npx pdftotext-mcp`

### Method 3: Development Installation
```bash
git clone https://github.com/jwebb85/pdftotext-mcp.git
cd pdftotext-mcp
npm install
```

## Configuration

### Claude Desktop
1. Locate your configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the server configuration:
```json
{
  "mcpServers": {
    "pdftotext": {
      "command": "pdftotext-mcp"
    }
  }
}
```

3. Restart Claude Desktop

### Other MCP Clients
Use `pdftotext-mcp` as the command in your MCP client configuration.

## Troubleshooting

### Common Issues

#### "command not found: pdftotext-mcp"
- **Solution**: Install globally with `npm install -g pdftotext-mcp`
- Or use the full path to the executable

#### "pdftotext is not available"
- **Solution**: Install poppler-utils (see Prerequisites above)
- Verify with `pdftotext -v`

#### Permission errors
- **Solution**: Ensure you have read permissions for PDF files
- On Unix systems: `chmod 644 yourfile.pdf`

#### MCP connection issues
- **Solution**: Restart your MCP client completely
- Check configuration file syntax
- Verify the command path is correct

### Getting Help
- Check the [GitHub Issues](https://github.com/jwebb85/pdftotext-mcp/issues)
- Review the [troubleshooting section](../README.md#-troubleshooting) in the README
- Open a new issue with detailed error information
