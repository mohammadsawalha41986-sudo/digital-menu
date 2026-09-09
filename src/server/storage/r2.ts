import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  StorageError,
  assertSafeKey,
  type PutObjectInput,
  type SignedUrlOptions,
  type StorageProvider,
  type StoredObject,
} from './provider';

export interface R2StorageOptions {
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  /** Public custom domain/base used for visitor-facing media. */
  publicBaseUrl: string;
}

/**
 * Cloudflare R2 through its S3-compatible API, implemented with Web fetch and
 * AWS Signature V4 so storage does not pull an SDK into the application bundle.
 * The provider uses path-style URLs: {endpoint}/{bucket}/{key}.
 */
export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2';

  private readonly bucket: string;
  private readonly endpoint: URL;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly publicBaseUrl: string;

  constructor(options: R2StorageOptions) {
    this.bucket = options.bucket.trim();
    this.endpoint = new URL(options.endpoint);
    this.accessKey = options.accessKey.trim();
    this.secretKey = options.secretKey;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');

    if (!this.bucket || !this.accessKey || !this.secretKey) {
      throw new StorageError('R2 storage credentials are incomplete');
    }
    if (this.endpoint.protocol !== 'https:' && this.endpoint.hostname !== 'localhost') {
      throw new StorageError('R2 endpoint must use HTTPS');
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    assertSafeKey(input.key);
    const body = input.body instanceof Uint8Array ? input.body : new Uint8Array(input.body);
    const response = await this.request('PUT', input.key, body, {
      'content-type': input.contentType,
      ...(input.cacheControl ? { 'cache-control': input.cacheControl } : {}),
    });
    await expectSuccess(response, `upload ${input.key}`);

    return {
      key: input.key,
      size: body.byteLength,
      contentType: input.contentType,
      publicUrl: this.publicUrl(input.key),
      lastModified: new Date(),
    };
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertSafeKey(key);
    const response = await this.request('GET', key);
    if (response.status === 404) return null;
    await expectSuccess(response, `read ${key}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async head(key: string): Promise<StoredObject | null> {
    assertSafeKey(key);
    const response = await this.request('HEAD', key);
    if (response.status === 404) return null;
    await expectSuccess(response, `inspect ${key}`);

    return {
      key,
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      publicUrl: this.publicUrl(key),
      lastModified: parseDate(response.headers.get('last-modified')),
    };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const response = await this.request('DELETE', key);
    if (response.status === 404) return;
    await expectSuccess(response, `delete ${key}`);
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${this.publicBaseUrl}/${encodeKey(key)}`;
  }

  async signedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    assertSafeKey(key);
    const expires = Math.min(3600, Math.max(1, options.expiresInSeconds ?? 300));
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const url = this.objectUrl(key);

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${this.accessKey}/${scope}`);
    url.searchParams.set('X-Amz-Date', amzDate);
    url.searchParams.set('X-Amz-Expires', String(expires));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');

    const canonicalRequest = [
      'GET',
      canonicalUri(url),
      canonicalQuery(url),
      `host:${url.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = signingKey(this.secretKey, dateStamp, 'auto', 's3', stringToSign);
    url.searchParams.set('X-Amz-Signature', signature);
    return url.toString();
  }

  async probe(): Promise<void> {
    const key = `.probe/${randomUUID()}`;
    const body = new TextEncoder().encode('ok');
    try {
      await this.put({ key, body, contentType: 'text/plain', cacheControl: 'no-store' });
      const read = await this.get(key);
      if (!read || read.byteLength !== body.byteLength || new TextDecoder().decode(read) !== 'ok') {
        throw new StorageError('R2 probe wrote an object it could not read back');
      }
    } finally {
      await this.delete(key).catch(() => {});
    }
  }

  private objectUrl(key: string): URL {
    assertSafeKey(key);
    const prefix = this.endpoint.pathname.replace(/\/$/, '');
    const path = `${prefix}/${encodeURIComponent(this.bucket)}/${encodeKey(key)}`.replace(/^\/\//, '/');
    const url = new URL(this.endpoint.origin);
    url.pathname = path;
    return url;
  }

  private async request(
    method: 'GET' | 'HEAD' | 'PUT' | 'DELETE',
    key: string,
    body?: Uint8Array,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? new Uint8Array());
    const signedHeaderValues: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const signedNames = Object.keys(signedHeaderValues).sort();
    const canonicalHeaders = signedNames.map((name) => `${name}:${signedHeaderValues[name]}\n`).join('');
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequest = [
      method,
      canonicalUri(url),
      canonicalQuery(url),
      canonicalHeaders,
      signedNames.join(';'),
      payloadHash,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = signingKey(this.secretKey, dateStamp, 'auto', 's3', stringToSign);
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, ` +
      `SignedHeaders=${signedNames.join(';')}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers: {
        ...extraHeaders,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        authorization,
      },
      ...(body ? { body } : {}),
    });
  }
}

async function expectSuccess(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  const requestId = response.headers.get('x-amz-request-id') ?? response.headers.get('cf-ray');
  const detail = requestId ? ` (${requestId})` : '';
  // Do not echo the response body: providers can include request metadata that
  // is unnecessary in application logs.
  throw new StorageError(`R2 failed to ${operation}: HTTP ${response.status}${detail}`);
}

function encodeKey(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function canonicalUri(url: URL): string {
  // URL.pathname is already percent-encoded; normalise the few characters
  // encodeURIComponent leaves unescaped but SigV4 requires escaped.
  return url.pathname.replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
  stringToSign: string,
): string {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const requestKey = hmac(serviceKey, 'aws4_request');
  return createHmac('sha256', requestKey).update(stringToSign).digest('hex');
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
