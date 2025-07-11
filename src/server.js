#!/usr/bin/env node

/**
 * PDFtotext MCP Server
 * 
 * A reliable Model Context Protocol server for PDF text extraction using pdftotext.
 * 
 * @author Jason Webb
 * @license MIT
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * PDFtotext MCP Server Class
 * 
 * Provides PDF text extraction capabilities through the Model Context Protocol
 * using the reliable pdftotext utility from poppler-utils.
 */
class PDFtotextServer {
  constructor() {
    this.server = new Server(
      {
        name: 'pdftotext-mcp',
        version: '1.0.0',
        description: 'A reliable MCP server for PDF text extraction using pdftotext',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Set up error handling and graceful shutdown
   */
  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[PDFtotext MCP Error]', error);
    };

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error('Shutting down PDFtotext MCP server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('Shutting down PDFtotext MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Set up MCP tool handlers
   */
  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'read_pdf_text',
          description: 'Extract text content from a PDF file using pdftotext from poppler-utils',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file (relative to current working directory or absolute path)',
              },
              page: {
                type: 'number',
                description: 'Specific page number to extract (1-based indexing). If not specified, extracts all pages.',
                minimum: 1,
              },
              layout: {
                type: 'boolean',
                description: 'Preserve original text layout formatting (default: false)',
                default: false,
              },
              encoding: {
                type: 'string',
                description: 'Text encoding for output (default: UTF-8)',
                default: 'UTF-8',
                enum: ['UTF-8', 'Latin1', 'ASCII'],
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'read_pdf_text') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      return await this.handleReadPdfText(request.params.arguments);
    });
  }

  /**
   * Check if pdftotext is available on the system
   */
  checkPdftotextAvailable() {
    try {
      execSync('pdftotext -v', { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate PDF file path and accessibility
   */
  validatePdfFile(filePath) {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check if file is readable
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`File is not readable: ${filePath}`);
    }

    // Basic PDF file validation (check extension and magic bytes)
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      throw new Error(`File does not appear to be a PDF: ${filePath}`);
    }

    try {
      const buffer = fs.readFileSync(filePath, { start: 0, end: 4 });
      if (!buffer.toString().startsWith('%PDF')) {
        throw new Error(`File is not a valid PDF (missing PDF header): ${filePath}`);
      }
    } catch (error) {
      if (error.message.includes('PDF header')) {
        throw error;
      }
      throw new Error(`Unable to validate PDF file: ${filePath}`);
    }
  }

  /**
   * Handle PDF text extraction
   */
  async handleReadPdfText(args) {
    try {
      const { 
        path: filePath, 
        page, 
        layout = false, 
        encoding = 'UTF-8' 
      } = args;

      // Check if pdftotext is available
      if (!this.checkPdftotextAvailable()) {
        throw new Error(
          'pdftotext is not available. Please install poppler-utils:\n' +
          '  Ubuntu/Debian: sudo apt install poppler-utils\n' +
          '  macOS: brew install poppler\n' +
          '  Windows: choco install poppler'
        );
      }

      // Validate the PDF file
      this.validatePdfFile(filePath);

      // Build pdftotext command
      const args_array = ['pdftotext'];
      
      // Add encoding if specified
      if (encoding !== 'UTF-8') {
        args_array.push('-enc', encoding);
      }

      // Add layout preservation if requested
      if (layout) {
        args_array.push('-layout');
      }

      // Add page specification if provided
      if (page) {
        args_array.push('-f', page.toString(), '-l', page.toString());
      }

      // Add input file and output to stdout
      args_array.push(filePath, '-');

      // Execute pdftotext
      const text = execSync(args_array.join(' '), { 
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for very large PDFs
        timeout: 30000, // 30 second timeout
      });

      // Get file metadata
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const fileDir = path.dirname(path.resolve(filePath));

      // Prepare response
      const response = {
        success: true,
        file: fileName,
        path: path.resolve(filePath),
        directory: fileDir,
        extractedText: text.trim(),
        pageSpecific: page || 'all',
        layoutPreserved: layout,
        encoding: encoding,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        extractedAt: new Date().toISOString(),
        textLength: text.trim().length,
        wordCount: text.trim().split(/\s+/).filter(word => word.length > 0).length,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };

    } catch (error) {
      // Prepare error response
      const errorResponse = {
        success: false,
        error: error.message,
        file: args.path || 'unknown',
        timestamp: new Date().toISOString(),
      };

      // Add specific error context if available
      if (error.code === 'ENOENT') {
        errorResponse.errorType = 'FILE_NOT_FOUND';
      } else if (error.code === 'EACCES') {
        errorResponse.errorType = 'PERMISSION_DENIED';
      } else if (error.message.includes('pdftotext')) {
        errorResponse.errorType = 'PDFTOTEXT_ERROR';
      } else if (error.message.includes('PDF')) {
        errorResponse.errorType = 'INVALID_PDF';
      } else {
        errorResponse.errorType = 'UNKNOWN_ERROR';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
      };
    }
  }

  /**
   * Start the MCP server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log to stderr only (stdout is reserved for MCP JSON-RPC)
    console.error('PDFtotext MCP server v1.0.0 running on stdio');
    console.error('Ready to process PDF text extraction requests...');
  }
}

// Start the server if this script is run directly
if (require.main === module) {
  const server = new PDFtotextServer();
  server.run().catch((error) => {
    console.error('Failed to start PDFtotext MCP server:', error);
    process.exit(1);
  });
}

module.exports = { PDFtotextServer };