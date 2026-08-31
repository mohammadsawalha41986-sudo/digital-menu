-- Client preview links and change requests (master spec §71-§73, §139, §140).
--
-- The managed-service workflow's missing half: staff could preview a profile,
-- but only behind a login, so "send it to the client for approval" had no
-- mechanism. These tables give a client a shareable, expiring, revocable link
-- that needs no account.
--
-- The token is stored hashed, exactly as an API key is: a leaked row must not
-- hand over working preview links.

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "preview_links" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipientNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "state" "ReviewState" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "respondedBy" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewed" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preview_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "previewLinkId" TEXT,
    "body" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preview_links_key_key" ON "preview_links"("key");
CREATE INDEX "preview_links_businessId_createdAt_idx" ON "preview_links"("businessId", "createdAt");
CREATE INDEX "change_requests_businessId_isDone_createdAt_idx" ON "change_requests"("businessId", "isDone", "createdAt");

-- AddForeignKey
ALTER TABLE "preview_links" ADD CONSTRAINT "preview_links_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preview_links" ADD CONSTRAINT "preview_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_previewLinkId_fkey" FOREIGN KEY ("previewLinkId") REFERENCES "preview_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
