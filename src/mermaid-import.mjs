export const MAX_MERMAID_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_MERMAID_IMPORT_NODES = 1000;
export const MAX_MERMAID_IMPORT_EDGES = 3000;
export const MAX_MERMAID_IMPORT_LABEL_CHARS = 512;

const MAX_LINE_CHARS = 5000;
const MAX_LINES = 1 + MAX_MERMAID_IMPORT_NODES + MAX_MERMAID_IMPORT_EDGES;
const SAFE_LABEL_CHAR = /^[A-Za-z0-9 _.,:/-]$/;
const NODE_ID = 'n(?:0|[1-9]\\d*)';
const ENCODED_LABEL_CHAR = '(?:[A-Za-z0-9 _.,:/-]|#(?:0|[1-9]\\d{0,6});)';
const nodeLine = new RegExp(`^  (${NODE_ID})\\["(${ENCODED_LABEL_CHAR}*)"\\]$`);
const edgeLine = new RegExp(`^  (${NODE_ID}) -->(?:\\|(${ENCODED_LABEL_CHAR}+)\\|)? (${NODE_ID})$`);

function fail(line, reason) {
  throw new Error(`Line ${line}: ${reason}`);
}

function decodeLabel(encoded, line) {
  const characters = [];
  let codePointCount = 0;
  for (let index = 0; index < encoded.length;) {
    const character = encoded[index];
    if (SAFE_LABEL_CHAR.test(character)) {
      characters.push(character);
      index += 1;
    } else if (character === '#') {
      const end = encoded.indexOf(';', index + 1);
      if (end < 0) fail(line, 'Malformed decimal character escape.');
      const digits = encoded.slice(index + 1, end);
      if (!/^(?:0|[1-9]\d{0,6})$/.test(digits)) fail(line, 'Malformed decimal character escape.');
      const codePoint = Number(digits);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        fail(line, 'Escape is not a valid Unicode scalar value.');
      }
      characters.push(String.fromCodePoint(codePoint));
      index = end + 1;
    } else {
      fail(line, 'Labels must use the exporter’s escaped character syntax.');
    }
    codePointCount += 1;
    if (codePointCount > MAX_MERMAID_IMPORT_LABEL_CHARS) {
      fail(line, 'Labels must be at most 512 characters.');
    }
  }
  return characters.join('');
}

function inputByteLength(text) {
  if (text.length > MAX_MERMAID_IMPORT_BYTES) return MAX_MERMAID_IMPORT_BYTES + 1;
  return new TextEncoder().encode(text).byteLength;
}

/** Parse only the exact, escaped flowchart subset emitted by SoloCanvas. */
export function parseMermaidFlowchart(text) {
  if (typeof text !== 'string') throw new Error('Import must be plain text.');
  if (inputByteLength(text) > MAX_MERMAID_IMPORT_BYTES) {
    throw new Error('Import failed: diagram exceeds 5 MiB.');
  }

  const normalized = text.replace(/\r\n/g, '\n');
  const bareCarriageReturn = normalized.indexOf('\r');
  if (bareCarriageReturn >= 0) {
    const line = normalized.slice(0, bareCarriageReturn).split('\n').length;
    fail(line, 'Only LF or CRLF line endings are supported.');
  }

  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length > MAX_LINES) fail(MAX_LINES + 1, 'Diagram exceeds the node or relationship limits.');
  if (lines[0] !== 'flowchart LR') fail(1, 'Expected the SoloCanvas "flowchart LR" header.');
  if (lines.length === 1) fail(2, 'Diagram must contain at least one component.');

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  let readingEdges = false;

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (line.length > MAX_LINE_CHARS) fail(lineNumber, 'Line exceeds 5000 characters.');
    if (line.length === 0) fail(lineNumber, 'Blank lines are not supported.');

    const nodeMatch = nodeLine.exec(line);
    if (nodeMatch) {
      if (readingEdges) fail(lineNumber, 'Component definitions must precede relationships.');
      if (nodes.length >= MAX_MERMAID_IMPORT_NODES) fail(lineNumber, 'Diagram exceeds 1000 components.');
      const id = nodeMatch[1];
      if (id !== `n${nodes.length}` || nodeIds.has(id)) {
        fail(lineNumber, 'Expected the next unique generated component ID.');
      }
      nodeIds.add(id);
      nodes.push({ id, label: decodeLabel(nodeMatch[2], lineNumber) });
      continue;
    }

    const edgeMatch = edgeLine.exec(line);
    if (edgeMatch) {
      readingEdges = true;
      if (edges.length >= MAX_MERMAID_IMPORT_EDGES) fail(lineNumber, 'Diagram exceeds 3000 relationships.');
      const [, source, encodedLabel, target] = edgeMatch;
      if (!nodeIds.has(source) || !nodeIds.has(target)) fail(lineNumber, 'Relationship references an unknown component ID.');
      edges.push({ source, target, label: encodedLabel === undefined ? '' : decodeLabel(encodedLabel, lineNumber) });
      continue;
    }

    fail(lineNumber, 'Unsupported Mermaid syntax.');
  }

  if (nodes.length === 0) fail(2, 'Diagram must contain at least one component.');
  return { nodes, edges };
}

export function validateMermaidImportDiagram(diagram) {
  if (!diagram || typeof diagram !== 'object' || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges) ||
      diagram.nodes.length === 0 || diagram.nodes.length > MAX_MERMAID_IMPORT_NODES ||
      diagram.edges.length > MAX_MERMAID_IMPORT_EDGES) return false;
  const nodeIds = new Set();
  const validLabel = label => {
    let count = 0;
    for (const character of label) {
      const codePoint = character.codePointAt(0);
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
      count += 1;
      if (count > MAX_MERMAID_IMPORT_LABEL_CHARS) return false;
    }
    return true;
  };
  for (let index = 0; index < diagram.nodes.length; index += 1) {
    const node = diagram.nodes[index];
    if (!node || node.id !== `n${index}` || typeof node.label !== 'string' || !validLabel(node.label)) return false;
    nodeIds.add(node.id);
  }
  return diagram.edges.every(edge => edge && nodeIds.has(edge.source) && nodeIds.has(edge.target) &&
    typeof edge.label === 'string' && validLabel(edge.label));
}
