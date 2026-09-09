import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip } from '@/server/qr/zip';
import { ImageZipError, normalizeItemCode, parseImageZip } from '@/server/import/image-zip';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('image ZIP import', () => {
  it('extracts supported images and derives item codes from basenames', () => {
    const archive = createZip([
      { name: 'BURGER-001.png', content: png },
      { name: 'photos/CAFE-002.jpg', content: jpeg },
      { name: 'notes.txt', content: 'ignored' },
    ]);

    const entries = parseImageZip(archive);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.itemCode)).toEqual(['BURGER-001', 'CAFE-002']);
    expect(entries[0]?.contentType).toBe('image/png');
    expect(entries[1]?.contentType).toBe('image/jpeg');
  });

  it('matches item codes case-insensitively without changing the stored code', () => {
    expect(normalizeItemCode('  BUKHARI-01 ')).toBe(normalizeItemCode('bukhari-01'));
  });

  it('rejects path traversal instead of normalising it', () => {
    const archive = createZip([{ name: '../MENU-1.png', content: png }]);

    expect(() => parseImageZip(archive)).toThrow(ImageZipError);
    expect(() => parseImageZip(archive)).toThrow(/Unsafe path/);
  });

  it('rejects two images that would overwrite the same item assignment', () => {
    const archive = createZip([
      { name: 'ITEM-1.png', content: png },
      { name: 'item-1.jpg', content: jpeg },
    ]);

    expect(() => parseImageZip(archive)).toThrow(/More than one image maps to item code/);
  });

  it('rejects a renamed non-image whose extension lies about its bytes', () => {
    const archive = createZip([{ name: 'ITEM-1.png', content: Buffer.from('<html>bad</html>') }]);

    expect(() => parseImageZip(archive)).toThrow(/not a valid image\/png/);
  });

  it('refuses to expand an entry that lies about its uncompressed size', () => {
    // The declared size is the archive author's to choose. Both the running
    // uncompressed budget and the compression-ratio check read it, so an entry
    // that under-declares passes them both; only a ceiling on the inflate
    // itself stops 200MB being materialised from a 200KB archive.
    const deflated = deflateRawSync(Buffer.alloc(200 * 1024 * 1024, 0));
    const archive = zipDeclaring('ITEM-1.png', deflated, 12);

    expect(() => parseImageZip(archive)).toThrow(ImageZipError);
    expect(() => parseImageZip(archive)).toThrow(/Could not decompress/);
    // Well under the 200MB the entry would have expanded to.
    expect(archive.byteLength).toBeLessThan(1024 * 1024);
  });

  it('rejects archives that contain no supported images', () => {
    const archive = createZip([{ name: 'README.txt', content: 'nothing to import' }]);

    expect(() => parseImageZip(archive)).toThrow(/contains no supported/);
  });
});

/**
 * A single-entry ZIP whose headers declare `declaredSize` regardless of what
 * the deflated payload actually expands to. `createZip` cannot express this,
 * because it writes honest headers.
 */
function zipDeclaring(name: string, deflated: Buffer, declaredSize: number): Uint8Array {
  const nameBytes = Buffer.from(name);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(nameBytes.length, 28);

  const localBlock = Buffer.concat([local, nameBytes, deflated]);
  const centralBlock = Buffer.concat([central, nameBytes]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return new Uint8Array(Buffer.concat([localBlock, centralBlock, eocd]));
}
