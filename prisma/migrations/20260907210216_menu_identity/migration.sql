-- AlterTable
ALTER TABLE "menus" ADD COLUMN     "coverMediaId" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
