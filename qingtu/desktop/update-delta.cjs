// Release tooling builds this plan from electron-builder blockmaps. On the
// client it only reads the old archive and writes a new, verified archive.
const fs = require('node:fs/promises');
const {createHash} = require('node:crypto');

const MAGIC = Buffer.from('QTD1');
const LITERAL = 0xffffffff;
const MAX_PATCH = 64 * 1024 * 1024;
const MAX_OPERATIONS = 131072;

async function applyDelta(patch, baseline, output, target, signal) {
  if (patch.length > MAX_PATCH || !patch.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('增量包格式无效');
  const input = await fs.open(baseline, 'r');
  try {
    const {size} = await input.stat();
    const dest = await fs.open(output, 'wx', 0o600);
    try {
      const hash = createHash('sha512');
      const buffer = Buffer.allocUnsafe(256 * 1024);
      let cursor = MAGIC.length, written = 0, operations = 0;
      while (cursor < patch.length) {
        signal?.throwIfAborted();
        if (++operations > MAX_OPERATIONS || cursor + 8 > patch.length) throw new Error('增量指令无效');
        const offset = patch.readUInt32LE(cursor), length = patch.readUInt32LE(cursor + 4);
        cursor += 8;
        if (!length || written + length > target.size) throw new Error('增量输出大小无效');
        if (offset === LITERAL) {
          if (cursor + length > patch.length) throw new Error('增量数据不完整');
          const bytes = patch.subarray(cursor, cursor + length);
          await dest.writeFile(bytes);
          hash.update(bytes);
          cursor += length;
        } else {
          if (offset + length > size) throw new Error('增量复制范围无效');
          let copied = 0;
          while (copied < length) {
            signal?.throwIfAborted();
            const {bytesRead} = await input.read(buffer, 0, Math.min(buffer.length, length - copied), offset + copied);
            if (!bytesRead) throw new Error('旧安装包不完整');
            const bytes = buffer.subarray(0, bytesRead);
            await dest.writeFile(bytes);
            hash.update(bytes);
            copied += bytesRead;
          }
        }
        written += length;
      }
      if (written !== target.size || hash.digest('base64') !== target.sha512) throw new Error('增量还原完整包校验失败');
    } finally { await dest.close(); }
  } finally { await input.close(); }
}
module.exports = {MAGIC, LITERAL, MAX_PATCH, MAX_OPERATIONS, applyDelta};
