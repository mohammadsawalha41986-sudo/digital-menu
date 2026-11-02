import { describe, expect, it } from 'vitest';
import { parseSpreadsheet } from '@/server/import/parse';

describe('legacy .xls uploads', () => {
  it('are refused with a plain instruction, not reported as an unreadable file', async () => {
    // The OLE2 container signature that every .xls (BIFF) file starts with.
    const legacy = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(parseSpreadsheet(legacy, 'menu.xls')).rejects.toThrow(/save it as \.xlsx or \.csv/);
  });

  it('are refused by signature even when the file name hides it', async () => {
    const legacy = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(parseSpreadsheet(legacy, 'menu.bin')).rejects.toThrow(/Legacy \.xls/);
  });
});
