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

  it('rejects archives that contain no supported images', () => {
    const archive = createZip([{ name: 'README.txt', content: 'nothing to import' }]);

    expect(() => parseImageZip(archive)).toThrow(/contains no supported/);
  });
});
