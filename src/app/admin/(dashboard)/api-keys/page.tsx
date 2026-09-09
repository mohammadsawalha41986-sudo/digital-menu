import { requireSuperAdmin } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { createApiKeyAction, revokeApiKeyAction } from '@/server/admin/api-key-actions';
import { ApiKeyManager } from './manager';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requireSuperAdmin();

  const clients = await prisma.apiClient.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      businessIds: true,
      scopes: true,
      marketingClientId: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const businesses = await prisma.business.findMany({
    where: { id: { in: clients.flatMap((client) => client.businessIds) } },
    select: { id: true, publicId: true },
  });

  const publicIdById = new Map(businesses.map((business) => [business.id, business.publicId]));

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">API keys</h1>
          <p className="admin__subtitle">
            Scoped programmatic access to <code>/api/v1</code>. Read/write keys are explicit,
            stored as hashes and shown only once when issued.
          </p>
        </div>
      </header>

      <ApiKeyManager
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name,
          tokenPrefix: client.tokenPrefix,
          scope:
            client.businessIds.length === 0
              ? 'Platform-wide'
              : client.businessIds.map((id) => publicIdById.get(id) ?? '(deleted)').join(', '),
          permissions: client.scopes.join(', '),
          marketingClientId: client.marketingClientId,
          isActive: client.isActive,
          lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
          expiresAt: client.expiresAt?.toISOString() ?? null,
          createdAt: client.createdAt.toISOString(),
        }))}
        createKey={createApiKeyAction}
        revokeKey={revokeApiKeyAction}
      />
    </>
  );
}
