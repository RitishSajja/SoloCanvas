import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, McpError, ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { validateContext } from './validate-context.mjs';

const maxBytes = 5 * 1024 * 1024;
const uri = 'solocanvas://board/context';
const mimeType = 'application/json';

function checkSnapshot(text) {
  let parsedMembers = 0;
  const value = JSON.parse(text, (_key, item) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      parsedMembers += Object.keys(item).length;
    }
    return item;
  });
  validateContext(value);

  // JSON.parse discards earlier duplicate members. The raw text we serve must
  // contain only the members that passed validation, including inside arrays.
  let quoted = false;
  let textMembers = 0;
  for (let i = 0; i < text.length; i++) {
    if (quoted && text[i] === '\\') i++;
    else if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text[i] === ':') textMembers++;
  }
  if (textMembers !== parsedMembers) throw new Error('Duplicate JSON member.');
}

async function readSnapshot(filePath) {
  // Nonblocking open lets a mistakenly chosen pipe be rejected by stat.
  const file = await open(filePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid snapshot file.');
    // Read one extra byte to detect growth without allocating beyond the limit.
    const buffer = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== info.size) throw new Error('Snapshot size changed.');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, offset));
    checkSnapshot(text);
    return text;
  } finally {
    await file.close();
  }
}

async function serve(text) {
  const server = new Server({ name: 'solocanvas-board-context', version: '0.1.0' }, {
    capabilities: { resources: {} },
  });
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [{ uri, name: 'SoloCanvas board context', mimeType }],
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, request => {
    if (request.params.uri !== uri) throw new McpError(-32002, 'Resource not found.');
    return { contents: [{ uri, mimeType, text }] };
  });
  await server.connect(new StdioServerTransport());
}

if (process.argv.length !== 3) {
  console.error('Usage: node mcp/board-context-server.mjs <board-context.json>');
  process.exitCode = 1;
} else {
  try {
    await serve(await readSnapshot(process.argv[2]));
  } catch {
    console.error('Unable to open the board context. Choose a valid UTF-8 SoloCanvas board-context export of up to 5 MiB.');
    process.exitCode = 1;
  }
}