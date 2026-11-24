import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildBoardContext } from '../src/spatial-context.mjs';

const server = fileURLToPath(new URL('../mcp/board-context-server.mjs', import.meta.url));
const resourceUri = 'solocanvas://board/context';

function exportText(title) {
  const workspace = {
    cards: [{ id: 'api', data: { label: 'Orders API', kind: 'file', path: 'orders.ts', sourceText: 'local implementation' } }],
    boards: [{
      id: 'services', title, parentPlacement: null,
      nodes: [{ id: 'api-here', cardId: 'api', position: { x: -30, y: 20 }, shape: 'rounded' }],
      notes: [{ id: 'review', position: { x: 0, y: 20 }, text: 'Reviewed café ☕' }],
      edges: [],
    }],
  };
  const context = buildBoardContext(workspace, 'services', {
    region: { x: -100, y: -100, width: 350, height: 350 }, includeNoteText: true,
  });
  // The resource must preserve the chosen file's exact whitespace and Unicode.
  return JSON.stringify(context, null, '\t').replaceAll('\n', '\r\n') + '\r\n';
}

async function tempDirectory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'solocanvas-mcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function withClient(file, verify) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [server, file], stderr: 'pipe' });
  const client = new Client({ name: 'solocanvas-interop-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    await verify(client);
  } finally {
    await client.close();
  }
}

async function readSnapshot(client) {
  const { contents } = await client.readResource({ uri: resourceUri });
  assert.equal(contents.length, 1);
  assert.equal(contents[0].uri, resourceUri);
  assert.equal(contents[0].mimeType, 'application/json');
  return contents[0].text;
}

test('a stdio client discovers one read-only snapshot and can only read the file chosen at startup', async t => {
  const dir = await tempDirectory(t);
  const file = path.join(dir, 'reviewed context.json');
  const other = path.join(dir, 'other.json');
  const before = exportText('Services 日');
  const after = exportText('Changes made after startup');
  const otherText = exportText('Unselected board marker');
  await writeFile(file, before);
  await writeFile(other, otherText);

  await withClient(file, async client => {
    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities.resources);
    assert.equal(capabilities.tools, undefined);
    const { resources, nextCursor } = await client.listResources();
    assert.deepEqual(resources.map(resource => resource.uri), [resourceUri]);
    assert.equal(resources[0].mimeType, 'application/json');
    assert.equal(nextCursor, undefined);
    assert.deepEqual((await client.listResourceTemplates()).resourceTemplates, []);
    assert.equal(await readSnapshot(client), before);

    for (const uri of [pathToFileURL(other).href, 'solocanvas://board/another-context', resourceUri + '?other']) {
      await assert.rejects(client.readResource({ uri }), error => {
        assert.equal(error.code, -32002);
        assert.doesNotMatch(error.message, /Unselected board marker/);
        return true;
      });
    }
    await assert.rejects(client.listTools());
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(other, 'utf8'), otherText);
    await writeFile(file, after);
    assert.equal(await readSnapshot(client), before);
  });

  await withClient(file, async client => assert.equal(await readSnapshot(client), after));
});

test('invalid startup selections exit without exposing the contents or starting an MCP session', async t => {
  const dir = await tempDirectory(t);
  const file = path.join(dir, 'chosen.json');
  const valid = exportText('Private fixture marker');
  const wrongEncoding = Buffer.from(valid);
  wrongEncoding[wrongEncoding.indexOf('Private fixture marker')] = 0xff;

  function expectFailure(args) {
    const result = spawnSync(process.execPath, [server, ...args], { input: '', encoding: 'utf8', timeout: 10_000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.ok(Number.isInteger(result.status) && result.status !== 0, 'Expected a nonzero process exit');
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.trim(), 'Expected an explanation on stderr');
    assert.doesNotMatch(result.stderr, /Private fixture marker/);
  }

  expectFailure([]);
  expectFailure([file]);
  await writeFile(file, valid);
  expectFailure([file, file]);
  for (const invalid of [
    '{"scope": "Private fixture marker"',
    JSON.stringify({ version: 3, cards: [], boards: [], title: 'Private fixture marker' }),
    valid.replace('"version": 1', '"version": 1, "version": 1'),
    wrongEncoding,
    valid + ' '.repeat(5 * 1024 * 1024),
  ]) {
    await writeFile(file, invalid);
    expectFailure([file]);
  }
});
