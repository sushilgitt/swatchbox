-- CreateEnum
CREATE TYPE "DisplayType" AS ENUM ('color', 'image', 'variant_image', 'button', 'dropdown');

-- CreateEnum
CREATE TYPE "OosBehavior" AS ENUM ('HIDE', 'DISABLE', 'NONE');

-- CreateEnum
CREATE TYPE "SwatchScope" AS ENUM ('GLOBAL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "SwatchValueSource" AS ENUM ('CSV', 'NATIVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ERROR');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "defaultDisplayType" "DisplayType" NOT NULL DEFAULT 'color',
    "oosBehavior" "OosBehavior" NOT NULL DEFAULT 'NONE',
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "lowStockMessage" TEXT NOT NULL DEFAULT 'Only {qty} left!',
    "showPrice" BOOLEAN NOT NULL DEFAULT false,
    "showBadges" BOOLEAN NOT NULL DEFAULT true,
    "collectionSwatchesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "splitByVariant" BOOLEAN NOT NULL DEFAULT false,
    "swatchShape" TEXT NOT NULL DEFAULT 'circle',
    "swatchSize" INTEGER NOT NULL DEFAULT 36,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "appEmbedEnabledCache" BOOLEAN NOT NULL DEFAULT false,
    "globalConfigJson" TEXT,
    "metafieldDefsCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionTypeMapping" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "displayType" "DisplayType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionTypeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorLibraryEntry" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "hex2" TEXT,
    "imageUrl" TEXT,
    "source" "SwatchValueSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColorLibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "displayTypeOverride" "DisplayType",
    "sizeChartUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metafieldSyncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwatchValue" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "scope" "SwatchScope" NOT NULL DEFAULT 'GLOBAL',
    "productId" TEXT,
    "optionName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "swatchType" "DisplayType" NOT NULL DEFAULT 'color',
    "hex" TEXT,
    "hex2" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwatchValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorReportJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL DEFAULT '#000000',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "OptionTypeMapping_shop_idx" ON "OptionTypeMapping"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OptionTypeMapping_shop_optionName_key" ON "OptionTypeMapping"("shop", "optionName");

-- CreateIndex
CREATE INDEX "ColorLibraryEntry_shop_idx" ON "ColorLibraryEntry"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ColorLibraryEntry_shop_name_key" ON "ColorLibraryEntry"("shop", "name");

-- CreateIndex
CREATE INDEX "ProductConfig_shop_idx" ON "ProductConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductConfig_shop_productId_key" ON "ProductConfig"("shop", "productId");

-- CreateIndex
CREATE INDEX "SwatchValue_shop_productId_idx" ON "SwatchValue"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SwatchValue_shop_scope_productId_optionName_value_key" ON "SwatchValue"("shop", "scope", "productId", "optionName", "value");

-- CreateIndex
CREATE INDEX "ImportJob_shop_idx" ON "ImportJob"("shop");

-- CreateIndex
CREATE INDEX "BadgeDefinition_shop_idx" ON "BadgeDefinition"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeDefinition_shop_key_key" ON "BadgeDefinition"("shop", "key");
