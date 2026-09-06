-- CreateEnum
CREATE TYPE "LinkCheckStatus" AS ENUM ('WORKING', 'BROKEN', 'BLOCKED');

-- CreateTable
CREATE TABLE "link_checks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "LinkCheckStatus" NOT NULL,
    "httpStatus" INTEGER,
    "reason" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "link_checks_businessId_status_idx" ON "link_checks"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "link_checks_businessId_url_key" ON "link_checks"("businessId", "url");

-- AddForeignKey
ALTER TABLE "link_checks" ADD CONSTRAINT "link_checks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
