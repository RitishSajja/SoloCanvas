import { createHash } from 'node:crypto';
import path from 'node:path';

const portRange = 20000;
const pathHash = createHash('sha256').update(path.resolve(process.cwd()).toLowerCase()).digest().readUInt32BE(0);
const worktreeOffset = pathHash % portRange;

export const DEV_PORT = 30000 + worktreeOffset;
export const PREVIEW_PORT = 30000 + ((worktreeOffset + portRange / 2) % portRange);
