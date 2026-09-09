import { inflateRawSync } from 'node:zlib';
import { ALLOWED_IMAGE_TYPES, validateUpload } from '@/server/files/validation';

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 500;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class ImageZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageZipError';
  }
}

export interface ImageZipEntry {
  fileName: string;
  itemCode: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Parses a deliberately small, safe subset of ZIP for bulk menu photography.
 *
 * Each image must be named exactly after the stable item code, for example
 * `BURGER-001.jpg`. Directories are ignored. ZIP64, encryption, unsupported
 * compression methods, path traversal and suspicious compression ratios are
 * rejected before any file reaches the media pipeline. The media pipeline then
 * performs its normal extension/content-type/magic-byte validation again.
 */
export function parseImageZip(bytes: Uint8Array): ImageZipEntry[] {
  if (bytes.byteLength === 0) throw new ImageZipError('The ZIP file is empty');
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new ImageZipError('The ZIP file is larger than the 100MB limit');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const disk = u16(view, eocdOffset + 4);
  const centralDisk = u16(view, eocdOffset + 6);
  const entriesOnDisk = u16(view, eocdOffset + 8);
  const entryCount = u16(view, eocdOffset + 10);
  const centralSize = u32(view, eocdOffset + 12);
  const centralOffset = u32(view, eocdOffset + 16);

  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ImageZipError('Multi-disk ZIP archives are not supported');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ImageZipError('ZIP64 archives are not supported');
  }
  if (entryCount > MAX_ENTRIES) {
    throw new ImageZipError(`The ZIP contains more than ${MAX_ENTRIES} entries`);
  }
  if (centralOffset + centralSize > bytes.byteLength) {
    throw new ImageZipError('The ZIP central directory is invalid');
  }

  const output: ImageZipEntry[] = [];
  const seenCodes = new Set<string>();
  let totalUncompressed = 0;
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || u32(view, offset) !== CENTRAL_SIGNATURE) {
      throw new ImageZipError('The ZIP central directory is corrupt');
    }

    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const expectedCrc = u32(view, offset + 16);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;

    if (nameEnd + extraLength + commentLength > bytes.byteLength) {
      throw new ImageZipError('A ZIP entry extends beyond the archive');
    }

    const fileName = new TextDecoder('utf-8').decode(bytes.subarray(nameStart, nameEnd));
    offset = nameEnd + extraLength + commentLength;

    if (flags & 0x1) throw new ImageZipError('Encrypted ZIP entries are not supported');
    if (method !== 0 && method !== 8) {
      throw new ImageZipError(`Unsupported ZIP compression method for ${fileName}`);
    }

    assertSafePath(fileName);
    if (fileName.endsWith('/')) continue;

    const contentType = contentTypeFor(fileName);
    if (!contentType) continue;

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ImageZipError('The uncompressed images exceed the 80MB safety limit');
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new ImageZipError(`Suspicious compression ratio for ${fileName}`);
    }

    const fileBytes = extractEntry(bytes, view, {
      fileName,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    if (calculateCrc32(fileBytes) !== expectedCrc) {
      throw new ImageZipError(`Checksum mismatch for ${fileName}`);
    }

    validateUpload(
      { fileName, declaredContentType: contentType, bytes: fileBytes },
      ALLOWED_IMAGE_TYPES,
    );

    const itemCode = baseName(fileName);
    if (!itemCode) throw new ImageZipError(`Image ${fileName} has no item code`);
    const normalizedCode = normalizeItemCode(itemCode);
    if (seenCodes.has(normalizedCode)) {
      throw new ImageZipError(`More than one image maps to item code ${itemCode}`);
    }
    seenCodes.add(normalizedCode);
    output.push({ fileName, itemCode, contentType, bytes: fileBytes });
  }

  if (output.length === 0) {
    throw new ImageZipError('The ZIP contains no supported .jpg, .jpeg, .png or .webp images');
  }

  return output;
}

export function normalizeItemCode(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function extractEntry(
  bytes: Uint8Array,
  view: DataView,
  entry: {
    fileName: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    localOffset: number;
  },
): Uint8Array {
  const { localOffset } = entry;
  if (localOffset + 30 > bytes.byteLength || u32(view, localOffset) !== LOCAL_SIGNATURE) {
    throw new ImageZipError(`Invalid local ZIP header for ${entry.fileName}`);
  }

  const localNameLength = u16(view, localOffset + 26);
  const localExtraLength = u16(view, localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) {
    throw new ImageZipError(`Compressed data is truncated for ${entry.fileName}`);
  }

  const compressed = bytes.subarray(dataStart, dataEnd);
  let result: Uint8Array;
  try {
    // The declared size is the attacker's to choose, so it cannot be trusted
    // as a fact — but it can be enforced as a ceiling. Without this, an entry
    // declaring 12 bytes and carrying 200KB of deflated zeros still expands to
    // 200MB in memory before the size check below rejects it; a 100MB archive
    // of those takes the container down. zlib stops at the ceiling instead.
    result =
      entry.method === 0
        ? new Uint8Array(compressed)
        : new Uint8Array(
            inflateRawSync(compressed, {
              maxOutputLength: Math.min(
                Math.max(entry.uncompressedSize, 1),
                MAX_TOTAL_UNCOMPRESSED_BYTES,
              ),
            }),
          );
  } catch {
    throw new ImageZipError(`Could not decompress ${entry.fileName}`);
  }

  if (result.byteLength !== entry.uncompressedSize) {
    throw new ImageZipError(`Uncompressed size does not match for ${entry.fileName}`);
  }
  return result;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (u32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new ImageZipError('This is not a valid ZIP archive');
}

function assertSafePath(fileName: string): void {
  if (fileName.includes('\\') || fileName.startsWith('/') || /^[A-Za-z]:/.test(fileName)) {
    throw new ImageZipError(`Unsafe path in ZIP: ${fileName}`);
  }
  const pathForValidation = fileName.endsWith('/') ? fileName.slice(0, -1) : fileName;
  if (!pathForValidation) throw new ImageZipError(`Unsafe path in ZIP: ${fileName}`);
  const segments = pathForValidation.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new ImageZipError(`Unsafe path in ZIP: ${fileName}`);
  }
}

function baseName(fileName: string): string {
  const leaf = fileName.split('/').pop() ?? '';
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(0, dot) : '';
}

function contentTypeFor(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

/** ZIP CRC32, kept local so the parser works throughout the declared Node >=20.11 range. */
function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new ImageZipError('Truncated ZIP data');
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new ImageZipError('Truncated ZIP data');
  return view.getUint32(offset, true);
}
