-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "currentTimestamp" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "video_url" JSONB;
