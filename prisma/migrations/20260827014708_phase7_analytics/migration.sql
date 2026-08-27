-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'UNKNOWN');

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchKey" TEXT,
    "eventType" TEXT NOT NULL,
    "targetKey" TEXT,
    "device" "DeviceCategory" NOT NULL DEFAULT 'UNKNOWN',
    "locale" TEXT,
    "visitorHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_businessId_createdAt_idx" ON "analytics_events"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_businessId_eventType_createdAt_idx" ON "analytics_events"("businessId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
