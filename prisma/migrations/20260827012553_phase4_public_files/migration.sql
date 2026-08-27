-- CreateEnum
CREATE TYPE "PublicFileKind" AS ENUM ('FILE', 'LINK');

-- CreateTable
CREATE TABLE "public_files" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "PublicFileKind" NOT NULL DEFAULT 'FILE',
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "externalUrl" TEXT,
    "currentVersionId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_file_versions" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "checksum" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_files_currentVersionId_key" ON "public_files"("currentVersionId");

-- CreateIndex
CREATE INDEX "public_files_businessId_isPublic_sortOrder_idx" ON "public_files"("businessId", "isPublic", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "public_files_businessId_key_key" ON "public_files"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "public_file_versions_storageKey_key" ON "public_file_versions"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "public_file_versions_fileId_version_key" ON "public_file_versions"("fileId", "version");

-- AddForeignKey
ALTER TABLE "public_files" ADD CONSTRAINT "public_files_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_files" ADD CONSTRAINT "public_files_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public_file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_file_versions" ADD CONSTRAINT "public_file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_file_versions" ADD CONSTRAINT "public_file_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
