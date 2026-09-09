import { afterEach, describe, expect, it, vi } from 'vitest';
import { R2StorageProvider } from '@/server/storage/r2';

function provider() {
  return new R2StorageProvider({
    bucket: 'menus',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    accessKey: 'access-key',
    secretKey: 'secret-key',
    publicBaseUrl: 'https://media.example.com',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('R2 storage provider', () => {
  it('builds public URLs from the configured visitor-facing domain', () => {
    expect(provider().publicUrl('businesses/ABC/menu photo.webp')).toBe(
      'https://media.example.com/businesses/ABC/menu%20photo.webp',
    );
  });

  it('signs uploads without leaking the secret in the request URL', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe('PUT');
      expect(headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=access-key\//);
      expect(headers.get('x-amz-content-sha256')).toMatch(/^[a-f0-9]{64}$/);
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await provider().put({
      key: 'businesses/ABC/photo.jpg',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=60',
    });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('/menus/businesses/ABC/photo.jpg');
    expect(requestUrl).not.toContain('secret-key');
  });

  it('creates time-limited signed GET URLs with SigV4 query parameters', async () => {
    const url = new URL(await provider().signedUrl('private/menu.pdf', { expiresInSeconds: 120 }));

    expect(url.pathname).toBe('/menus/private/menu.pdf');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('access-key/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('treats a missing object as null instead of an infrastructure failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(provider().get('businesses/ABC/missing.jpg')).resolves.toBeNull();
  });

  it('rejects unsafe object keys before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().get('../secret')).rejects.toThrow(/Unsafe storage key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
