import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createZip } from '@/server/qr/zip';

/**
 * The ZIP writer is hand-rolled, so it is verified against a real unzip rather
 * than against itself. A format implementation that only its own reader
 * accepts is not an implementation of the format.
 */

function hasUnzip(): boolean {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const unzipAvailable = hasUnzip();

describe('zip writer', () => {
  it('produces an archive with the ZIP magic number', () => {
    const zip = createZip([{ name: 'a.txt', content: 'hello' }]);

    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('compresses text rather than merely storing it', () => {
    const repetitive = 'the same sentence over and over. '.repeat(200);
    const zip = createZip([{ name: 'a.txt', content: repetitive }]);

    expect(zip.length).toBeLessThan(repetitive.length / 4);
  });

  it('holds several entries', () => {
    const zip = createZip([
      { name: 'one.svg', content: '<svg/>' },
      { name: 'two.svg', content: '<svg/>' },
      { name: 'three.svg', content: '<svg/>' },
    ]);

    // Three local headers.
    let count = 0;
    for (let index = 0; index + 4 <= zip.length; index += 1) {
      if (zip.readUInt32LE(index) === 0x04034b50) count += 1;
    }
    expect(count).toBe(3);
  });

  it.skipIf(!unzipAvailable)('round-trips through the system unzip', () => {
    const files = [
      { name: 'table-card.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
      { name: 'poster-a4.svg', content: '<svg>القائمة</svg>' },
      { name: 'README.txt', content: 'The QR kit.\nEvery piece encodes the same address.\n' },
    ];

    const directory = mkdtempSync(path.join(tmpdir(), 'zip-test-'));
    const archive = path.join(directory, 'kit.zip');

    writeFileSync(archive, createZip(files));

    // `unzip -t` verifies every CRC; a wrong checksum fails here.
    execFileSync('unzip', ['-t', archive], { stdio: 'ignore' });
    execFileSync('unzip', ['-o', archive, '-d', directory], { stdio: 'ignore' });

    for (const file of files) {
      const extracted = path.join(directory, file.name);
      expect(existsSync(extracted), file.name).toBe(true);
      expect(readFileSync(extracted, 'utf8')).toBe(file.content);
    }
  });

  it.skipIf(!unzipAvailable)('preserves UTF-8 filenames and Arabic content', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'zip-utf8-'));
    const archive = path.join(directory, 'kit.zip');

    writeFileSync(archive, createZip([{ name: 'قائمة.svg', content: '<svg>مطعم نور</svg>' }]));

    execFileSync('unzip', ['-t', archive], { stdio: 'ignore' });
    execFileSync('unzip', ['-o', archive, '-d', directory], { stdio: 'ignore' });

    expect(readFileSync(path.join(directory, 'قائمة.svg'), 'utf8')).toBe('<svg>مطعم نور</svg>');
  });
});
