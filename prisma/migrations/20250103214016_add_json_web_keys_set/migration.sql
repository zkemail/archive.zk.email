-- CreateTable
CREATE TABLE "JsonWebKeySets" (
    "id" SERIAL NOT NULL,
    "x509Certificate" TEXT NOT NULL,
    "jwks" TEXT NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "provenanceVerified" BOOLEAN,

    CONSTRAINT "JsonWebKeySets_pkey" PRIMARY KEY ("id")
);
