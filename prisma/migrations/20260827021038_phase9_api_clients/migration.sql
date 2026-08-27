-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "businessIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketingClientId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_tokenPrefix_key" ON "api_clients"("tokenPrefix");

-- CreateIndex
CREATE INDEX "api_clients_isActive_idx" ON "api_clients"("isActive");
