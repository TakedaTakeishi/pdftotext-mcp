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
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_INLINE_CHARS = 10000;
const MAX_CACHE_FILES = 5;

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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'read_pdf_text',
          description: 'Extract text content from a PDF file. Returns extractedText inline (small) or textFilePath (large). Results are cached per PDF+page; fromCache=true if reused. When possible, also returns chapterInRange with the detected chapter title.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the PDF file (relative to current working directory or absolute path)' },
              page: { type: 'number', description: 'Specific page number to extract (1-based). If not specified, extracts all pages.', minimum: 1 },
              page_start: { type: 'number', description: 'First page of a range (1-based). Use instead of "page" for multi-page ranges.', minimum: 1 },
              page_end: { type: 'number', description: 'Last page of a range (1-based). Requires page_start. Extracts single page if omitted.', minimum: 1 },
              offset: { type: 'number', description: 'Page offset from get_pdf_info (front matter pages). When set, page/page_start are treated as book page numbers and auto-converted: pdfPage = bookPage + offset.', minimum: 0 },
              clean: { type: 'boolean', description: 'Remove standalone page numbers and short headers. Join broken paragraph lines. Useful when layout is messy (default: false)', default: false },
              layout: { type: 'boolean', description: 'Preserve original text layout formatting (default: false)', default: false },
              encoding: { type: 'string', description: 'Text encoding for output (default: UTF-8)', default: 'UTF-8', enum: ['UTF-8', 'Latin1', 'ASCII'] },
            },
            required: ['path'],
          },
        },
        {
          name: 'extract_pdf_toc',
          description: 'Extract the table of contents from the first pages of a PDF. Returns tocFilePath pointing to the cached TOC file (use Read tool to view). Results are cached; fromCache=true if reused.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the PDF file' },
              max_pages: { type: 'number', description: 'Number of initial pages to extract for TOC analysis (default: 40)', minimum: 1, maximum: 100, default: 40 },
            },
            required: ['path'],
          },
        },
        {
          name: 'search_pdf',
          description: 'Search for keywords across the entire PDF. Returns results inline (small) or resultsFilePath (large results as JSON file). Results are cached per PDF+query; fromCache=true if reused. Supports comma-separated multi-keyword search. Use with get_pdf_info for pageOffset: bookPage = pdfPage - offset.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the PDF file' },
              query: { type: 'string', description: 'Search query. Use commas to search for multiple keywords (e.g. "consensus, split brain, paxos"). Case-insensitive.' },
              context_lines: { type: 'number', description: 'Number of context lines before and after each match (default: 2)', minimum: 0, maximum: 10, default: 2 },
              max_results: { type: 'number', description: 'Maximum number of matches to return (default: 50)', minimum: 1, maximum: 200, default: 50 },
              mode: { type: 'string', description: 'Match mode: "any" returns lines matching ANY keyword; "all" requires ALL keywords on the same line (default: "any")', enum: ['any', 'all'], default: 'any' },
            },
            required: ['path', 'query'],
          },
        },
        {
          name: 'get_pdf_info',
          description: 'Get metadata about a PDF file: total page count, pageOffset (estimated front matter pages before content, null if uncertain), file size, last modified date. The offset maps between PDF and book page numbers: bookPage = pdfPage - offset. If offset is null, check pageOffsetDetail for manual instructions.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the PDF file' },
            },
            required: ['path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'read_pdf_text':
          return await this.handleReadPdfText(args);
        case 'extract_pdf_toc':
          return await this.handleExtractToc(args);
        case 'search_pdf':
          return await this.handleSearchPdf(args);
        case 'get_pdf_info':
          return await this.handleGetPdfInfo(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Check if pdftotext is available on the system
   */
  checkPdftotextAvailable() {
    try {
      const result = spawnSync('pdftotext', ['-v'], { stdio: 'pipe' });
      return result.status === 0 || result.stderr?.includes('pdftotext');
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
   * Run pdftotext with the given arguments and return stdout
   */
  runPdftotext(pdftotextArgs) {
    const result = spawnSync('pdftotext', pdftotextArgs, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      timeout: 60000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`pdftotext exited with code ${result.status}: ${result.stderr?.trim() || 'Unknown error'}`);
    }
    return result.stdout;
  }

  /**
   * Build a consistent error response
   */
  buildErrorResponse(error, filePath) {
    const errorResponse = {
      success: false,
      error: error.message,
      file: filePath || 'unknown',
      timestamp: new Date().toISOString(),
    };
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
    return errorResponse;
  }

  /**
   * Get deterministic cache directory (creates if needed)
   */
  getCacheDir() {
    const d = path.join(os.tmpdir(), 'pdftotext-mcp-cache');
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
  }

  /**
   * Enforce max cache size: keep newest MAX_CACHE_FILES, delete rest
   */
  enforceCacheLimit() {
    try {
      const d = this.getCacheDir();
      const files = fs.readdirSync(d)
        .map(f => ({ name: f, p: path.join(d, f), m: fs.statSync(path.join(d, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m);
      if (files.length > MAX_CACHE_FILES) {
        for (const f of files.slice(MAX_CACHE_FILES)) fs.unlinkSync(f.p);
      }
    } catch (_) { }
  }

  /**
   * Build a deterministic cache key for a given tool + PDF + params
   */
  buildCacheKey(prefix, filePath, ...params) {
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const extras = params.filter(Boolean).join('_').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${prefix}_${safeName}${extras ? '_' + extras : ''}`;
  }

  /**
   * Decide how to return output: inline (small) or file (large/cacheable).
   * Checks cache first: if same tool+params exist and PDF hasn't changed, reuses file.
   *
   * @param {string|object} data  - text string or JSON-serializable object
   * @param {string}        key   - deterministic cache key
   * @param {string|null}   pdfPath - PDF path for cache invalidation
   * @returns {{ inline?: any, filePath?: string, fromCache?: boolean }}
   */
  resolveOutput(data, key, pdfPath) {
    const dir = this.getCacheDir();
    const outPath = path.join(dir, `${key}.txt`);

    // Cache hit: PDF not modified since this output was cached
    if (pdfPath && fs.existsSync(outPath)) {
      try {
        if (fs.statSync(pdfPath).mtimeMs <= fs.statSync(outPath).mtimeMs) {
          return { filePath: outPath, fromCache: true };
        }
      } catch (_) { }
    }

    // String data
    if (typeof data === 'string') {
      if (data.length <= MAX_INLINE_CHARS) {
        return { inline: data };
      }
      fs.writeFileSync(outPath, data, 'utf-8');
      this.enforceCacheLimit();
      return { filePath: outPath };
    }

    // Object data
    const serialized = JSON.stringify(data, null, 2);
    if (serialized.length <= MAX_INLINE_CHARS) {
      return { inline: data };
    }
    fs.writeFileSync(outPath, serialized, 'utf-8');
    this.enforceCacheLimit();
    return { filePath: outPath };
  }

  /**
   * Clean PDF text: remove standalone page numbers, short headers, and leaders.
   * Preserves paragraph structure without layout noise.
   */
  cleanText(raw) {
    return raw.split('\n')
      .map(l => l.replace(/\f/g, '').trim())
      .filter((l, i, arr) => {
        if (!l) return true;
        if (/^\d+$/.test(l) && l.length <= 4) return false;
        if (/^[•■\–\-—]\s*$/.test(l)) return false;
        if (l.length < 4 && /^[A-Z\s]+$/.test(l) && arr[i + 1] && arr[i + 1].length > 20) return false;
        return true;
      })
      .join('\n');
  }

  /**
   * Detect section/chapter heading near the top of extracted text.
   * Supports EN/ES patterns. Best-effort — null if uncertain.
   */
  findChapterInfo(text) {
    const lines = text.split('\n');
    const maxScan = Math.min(lines.length, 20);

    // Map spelled-out numbers → digits
    const wordToNum = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15 };

    const spelledOut = '(?:' + Object.keys(wordToNum).join('|') + ')';
    const wordNumRe = new RegExp('^(Chapter|CHAPTER|Capítulo|CAPÍTULO)\\s+' + spelledOut + '\\s*$', 'i');

    // Ordered by specificity: standalone heading → inline heading → numbered title
    const patterns = [
      // Standalone: "Chapter X" / "Capítulo X" on its own line
      { re: /^(Chapter|CHAPTER|Capítulo|CAPÍTULO|Ch\.|Cap\.)\s+(\d+)\s*$/,
        fmt: (m) => `Chapter ${m[2]}` },
      // Standalone with spelled-out: "Chapter Two" on its own line
      { re: wordNumRe,
        fmt: (m) => `Chapter ${wordToNum[m[2].toLowerCase()]}` },
      // "Part I" / "Parte I"
      { re: /^(Part|PART|Parte|PARTE|Module|MODULE|Módulo|MÓDULO|Unit|UNIT|Unidad|UNIDAD)\s+([A-Z\d]+)\s*$/i,
        fmt: (m) => `${m[1]} ${m[2]}` },
      // Standalone: "LESSON 1" / "Lección 1" / "Topic 1" / "Tema 1"
      { re: /^(Lesson|LESSON|Lección|LECCIÓN|Topic|TOPIC|Tema|TEMA)\s+(\d+)\s*$/i,
        fmt: (m) => `${m[1]} ${m[2]}` },
      // Inline: "Chapter 1. Title" / "Chapter X Title" — captures number + title
      { re: /^(Chapter|CHAPTER|Capítulo|CAPÍTULO)\s+(\S+)\s+(.+)/i,
        fmt: (m) => {
          const rawNum = m[2].replace(/[\.:]$/, '');
          const num = wordToNum[rawNum.toLowerCase()] || rawNum;
          return `Chapter ${num}: ${m[3].trim()}`;
        } },
      // Inline: "1. Title" (DDA-style, but filter out reference numbers)
      { re: /^(\d+)\.\s+([A-Z][A-Za-z].+)/,
        fmt: (m) => `Chapter ${m[1]}: ${m[2].trim()}` },
    ];

    for (const p of patterns) {
      for (let i = 0; i < maxScan; i++) {
        const line = lines[i].trim();
        const m = line.match(p.re);
        if (!m) continue;

        const number = p.fmt(m);

        // For standalone patterns, look ahead for the title
        if (p.re.source.includes('\\s*$')) {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const t = lines[j].trim().replace(/^[•■\–\-—]\s*/, '');
            if (t.length > 10 && /[a-záéíóúñ]/i.test(t) && !/^\d+$/.test(t)) {
              return { number, title: t };
            }
          }
          return { number, title: null };
        }

        // Inline patterns already have the title
        const title = m[m.length - 1].trim();
        if (title.length > 5) {
          return { number, title };
        }
      }
    }

    // Fallback: look for any line that looks like a big section title
    for (let i = 0; i < maxScan; i++) {
      const line = lines[i].trim();
      if (line.length > 15 && line.length < 120 &&
          /[A-ZÁÉÍÓÚÑ]/.test(line) && /[a-záéíóúñ]/.test(line) &&
          !line.endsWith('.') && !/\.{3,}/.test(line) &&
          !/^\d+$/.test(line)) {
        // Check it's not a running header (too short, typically < 40 chars for headers)
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        const prevLine = lines[i - 1] ? lines[i - 1].trim() : '';
        // If preceded by a blank line or page number, likely a heading
        if (prevLine === '' || /^\d+$/.test(prevLine)) {
          return { number: null, title: line };
        }
      }
    }

    return null;
  }

  /**
   * Handle PDF text extraction
   */
  async handleReadPdfText(args) {
    try {
      const { 
        path: filePath, 
        page, 
        page_start, 
        page_end, 
        layout = false, 
        clean = false,
        offset,
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
      let firstPage, lastPage;
      if (page) {
        firstPage = page;
        lastPage = page;
      } else if (page_start) {
        firstPage = page_start;
        lastPage = page_end || page_start;
      }

      // If offset is given, convert book pages → PDF pages
      if (offset !== undefined && firstPage) {
        firstPage = firstPage + offset;
        lastPage = lastPage + offset;
      }

      if (firstPage) {
        args_array.push('-f', firstPage.toString(), '-l', lastPage.toString());
      }

      // Add input file and output to stdout
      args_array.push(filePath, '-');

      // Execute pdftotext
      let text = this.runPdftotext(args_array.slice(1));

      // Apply clean mode if requested
      if (clean) {
        text = this.cleanText(text);
      }

      // Detect chapter info from the text (best-effort, may be null)
      const chapter = this.findChapterInfo(text);

      // Get file metadata
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const fileDir = path.dirname(path.resolve(filePath));
      const pageLabel = page ? String(page) : (page_start ? `${page_start}–${lastPage || page_start}` : 'all');

      const response = {
        success: true,
        file: fileName,
        path: path.resolve(filePath),
        directory: fileDir,
        pageSpecific: pageLabel,
        layoutPreserved: layout,
        cleanMode: clean,
        encoding: encoding,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        extractedAt: new Date().toISOString(),
        textLength: text.trim().length,
        wordCount: text.trim().split(/\s+/).filter(word => word.length > 0).length,
      };

      if (offset !== undefined) {
        response.offsetApplied = offset;
      }

      if (chapter) {
        response.chapterInRange = chapter;
      } else if (page || page_start) {
        response.chapterInRange = null;
        response.chapterInfoNote = 'Could not detect chapter heading in this page range. The chapter title may not appear on these pages directly.';
      }

      // Resolve inline vs file cache
      const cacheKey = this.buildCacheKey('read', filePath, pageLabel);
      const out = this.resolveOutput(text.trim(), cacheKey, filePath);
      if (out.inline !== undefined) {
        response.extractedText = out.inline;
      }
      if (out.filePath) {
        response.textFilePath = out.filePath;
        response.fromCache = out.fromCache || false;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(this.buildErrorResponse(error, args.path), null, 2),
          },
        ],
      };
    }
  }

  /**
   * Extract the table of contents section from raw PDF text
   */
  extractTocSection(rawText) {
    // Split by page breaks so we can detect page boundaries
    const pages = rawText.split('\f');
    let startPage = -1;
    let endPage = pages.length;

    // Content pages that signal TOC is over (standalone headings at page start)
    const contentStartMarkers = [
      /^Preface\b/im, /^Foreword\b/im, /^Acknowledgments\b/im,
      /^Chapter\s+1\b/im, /^Part\s+I\b/im, /^1\.\s/im,
      /^Computer Architecture\./i, /^DOI:/i,
    ];

    for (let i = 0; i < pages.length; i++) {
      const trimmed = pages[i].trim();
      if (trimmed.length < 10) continue;

      const firstBlock = trimmed.split('\n').filter(l => l.trim().length > 0).slice(0, 5).join('\n');

      if (startPage === -1) {
        if (/(?:^|\n)contents\b/i.test(firstBlock) && !firstBlock.includes('■')) {
          startPage = i;
        }
        continue;
      }

      for (const marker of contentStartMarkers) {
        if (marker.test(firstBlock)) {
          endPage = i;
          return pages.slice(startPage, endPage).join('\f');
        }
      }
    }

    if (startPage !== -1) {
      return pages.slice(startPage).join('\f');
    }

    // Fallback: return first half
    return pages.slice(0, Math.floor(pages.length / 2)).join('\f');
  }

  /**
   * Handle TOC extraction — writes full TOC to a fixed-path temp file to avoid
   * JSON truncation. The file is overwritten on each call (no accumulation).
   * Use the Read tool to view the file at tocFilePath.
   */
  async handleExtractToc(args) {
    try {
      const { path: filePath, max_pages = 40 } = args;
      if (!this.checkPdftotextAvailable()) {
        throw new Error('pdftotext is not available. Please install poppler-utils.');
      }
      this.validatePdfFile(filePath);

      const text = this.runPdftotext(['-f', '1', '-l', String(max_pages), filePath, '-']);
      const tocSection = this.extractTocSection(text);

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      const response = {
        success: true,
        file: fileName,
        path: path.resolve(filePath),
        pagesExtracted: max_pages,
        tocLength: tocSection.trim().length,
        fileSize: stats.size,
        extractedAt: new Date().toISOString(),
      };

      const cacheKey = this.buildCacheKey('toc', filePath);
      const out = this.resolveOutput(tocSection.trim(), cacheKey, filePath);
      if (out.inline !== undefined) {
        response.tocText = out.inline;
      }
      if (out.filePath) {
        response.tocFilePath = out.filePath;
        response.fromCache = out.fromCache || false;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(this.buildErrorResponse(error, args.path), null, 2) }] };
    }
  }

  /**
   * Handle keyword search across PDF
   */
  async handleSearchPdf(args) {
    try {
      const { path: filePath, query, context_lines = 2, max_results = 50, mode = 'any' } = args;
      if (!this.checkPdftotextAvailable()) {
        throw new Error('pdftotext is not available. Please install poppler-utils.');
      }
      this.validatePdfFile(filePath);

      const fullText = this.runPdftotext([filePath, '-']);

      const pages = fullText.split('\f');
      const keywords = query.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

      if (keywords.length === 0) {
        throw new Error('No valid keywords found in query. Use commas to separate multiple keywords.');
      }

      const matches = [];
      for (let i = 0; i < pages.length && matches.length < max_results; i++) {
        const pageNum = i + 1;
        const lines = pages[i].split('\n');

        for (let j = 0; j < lines.length && matches.length < max_results; j++) {
          const lineLower = lines[j].toLowerCase();
          const matchedKeywords = keywords.filter(k => lineLower.includes(k));

          let isMatch = false;
          if (mode === 'all') {
            isMatch = matchedKeywords.length === keywords.length;
          } else {
            isMatch = matchedKeywords.length > 0;
          }

          if (isMatch) {
            const start = Math.max(0, j - context_lines);
            const end = Math.min(lines.length, j + context_lines + 1);
            const contextText = lines.slice(start, end).join('\n');

            matches.push({
              page: pageNum,
              lineNumber: j + 1,
              matchedKeywords: matchedKeywords,
              text: lines[j].trim().substring(0, 300),
              context: contextText.trim().substring(0, 2000),
            });
          }
        }
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      const response = {
        success: true,
        file: fileName,
        path: path.resolve(filePath),
        query: query,
        mode: mode,
        totalMatches: matches.length,
        totalPages: pages.length,
        fileSize: stats.size,
        extractedAt: new Date().toISOString(),
      };

      const cacheKey = this.buildCacheKey('search', filePath, query, mode, String(context_lines));
      const out = this.resolveOutput(matches, cacheKey, filePath);
      if (out.inline !== undefined) {
        response.results = out.inline;
      }
      if (out.filePath) {
        response.resultsFilePath = out.filePath;
        response.fromCache = out.fromCache || false;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(this.buildErrorResponse(error, args.path), null, 2) }] };
    }
  }

  /**
   * Estimate page offset between PDF page numbers and printed book page numbers.
   * Uses multiple heuristics and reports confidence.
   *
   * Method A: Scan first 300 pages for a chapter heading (Chapter 1, 1., Part I).
   * Method B: Count consecutive short pages at the start (front matter is often sparse).
   *
   * Returns null + reason if neither method gives confidence.
   */
  detectPageOffset(fullText) {
    const pages = fullText.split('\f');
    const result = { offset: null, method: null, reason: null };

    // Method A: Look for chapter heading
    for (let i = 0; i < pages.length && i < 300; i++) {
      const trimmed = pages[i].trim();
      if (trimmed.length < 50) continue;

      const firstLine = trimmed.split('\n')[0].trim();
      if (firstLine.match(/^(Copyright|Contents|Preface|Foreword|Acknowledgments|Dedication|About the|Publisher|Library of Congress|ISBN|This page intentionally|Table of|How to|Who Should|References|Contributors|Reviewers|Notices)/i)) {
        continue;
      }

      const chapterStart = trimmed.match(/^(Chapter\s+1|Part\s+I|1\.\s+)/im);
      const notInToc = !/contents|table of contents/i.test(trimmed.slice(0, 200));

      if (chapterStart && notInToc) {
        result.offset = i;
        result.method = 'chapter_heading';
        return result;
      }
    }

    // Method B: Count consecutive short pages (front matter = copyright, dedication, blank, TOC)
    let shortCount = 0;
    for (let i = 0; i < Math.min(80, pages.length); i++) {
      const len = pages[i].trim().length;
      if (len < 150) {
        shortCount++;
      } else {
        break;
      }
    }
    if (shortCount >= 3 && shortCount < 60) {
      result.offset = shortCount;
      result.method = 'short_pages_heuristic';
      result.reason = `First ${shortCount} pages are short (typical front matter: copyright, TOC, preface).`;
      return result;
    }

    // Neither method succeeded
    result.offset = null;
    result.reason = 'Could not detect page offset automatically. The first chapter heading pattern was not found and front matter page count could not be determined. Check manually: use extract_pdf_toc to find the book\'s page 1, then search_pdf for that chapter heading to find its PDF page; offset = pdfPage - bookPage.';
    return result;
  }

  /**
   * Handle PDF metadata extraction
   */
  async handleGetPdfInfo(args) {
    try {
      const { path: filePath } = args;
      if (!this.checkPdftotextAvailable()) {
        throw new Error('pdftotext is not available. Please install poppler-utils.');
      }
      this.validatePdfFile(filePath);

      const fullText = this.runPdftotext([filePath, '-']);
      const pageCount = fullText.split('\f').length;
      const offsetResult = this.detectPageOffset(fullText);
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      const response = {
        success: true,
        file: fileName,
        path: path.resolve(filePath),
        pageCount: pageCount,
        fileSize: stats.size,
        fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        lastModified: stats.mtime.toISOString(),
        extractedAt: new Date().toISOString(),
      };

      if (offsetResult.offset !== null) {
        response.pageOffset = offsetResult.offset;
        response.pageOffsetNote = `PDF page ${offsetResult.offset + 1} is the first content page. Book page N ≈ PDF page (N + ${offsetResult.offset}).`;
        response.pageOffsetMethod = offsetResult.method;
        if (offsetResult.reason) response.pageOffsetDetail = offsetResult.reason;
      } else {
        response.pageOffset = null;
        response.pageOffsetNote = 'Page offset could not be detected automatically. See pageOffsetDetail for manual instructions.';
        response.pageOffsetDetail = offsetResult.reason;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(this.buildErrorResponse(error, args.path), null, 2) }] };
    }
  }

  /**
   * Start the MCP server
   */
  async run() {
    // Clean up stale cache entries (>1h) from previous sessions
    try {
      const cacheDir = this.getCacheDir();
      for (const f of fs.readdirSync(cacheDir)) {
        try {
          if (Date.now() - fs.statSync(path.join(cacheDir, f)).mtimeMs > 3600000) {
            fs.unlinkSync(path.join(cacheDir, f));
          }
        } catch (_) { }
      }
    } catch (_) { }

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