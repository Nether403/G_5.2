import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicationObjectDeliveryBackend,
  type ObjectDeliveryBackend,
} from "./objectDelivery";
import { AzureBlobObjectDelivery } from "./azureBlobObjectDelivery";

test("getPublicationObjectDeliveryBackend resolves azure-blob", () => {
  const backend = getPublicationObjectDeliveryBackend("azure-blob");
  assert.equal(backend.name, "azure-blob");
  assert.ok(backend instanceof AzureBlobObjectDelivery);
});

test("getPublicationObjectDeliveryBackend rejects unknown backends", () => {
  assert.throws(
    () =>
      getPublicationObjectDeliveryBackend(
        "not-real" as unknown as ObjectDeliveryBackend["name"]
      ),
    /Unknown publication object delivery backend/i
  );
});

test("AzureBlobObjectDelivery uploads through Azure Blob semantics", async () => {
  const calls: Array<{
    key: string;
    filePath: string;
    options: {
      blobHTTPHeaders: { blobContentType: string };
      metadata?: Record<string, string>;
    };
  }> = [];

  const backend = new AzureBlobObjectDelivery({
    connectionString: "UseDevelopmentStorage=true",
    containerName: "witness",
    createBlobServiceClient: (connectionString) => {
      assert.equal(connectionString, "UseDevelopmentStorage=true");
      return {
        getContainerClient(containerName) {
          assert.equal(containerName, "witness");
          return {
            getBlockBlobClient(key) {
              return {
                url: `https://example.invalid/${key}`,
                async uploadFile(filePath, options) {
                  calls.push({ key, filePath, options });
                },
              };
            },
          };
        },
      };
    },
  });

  const result = await backend.putObject({
    key: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
    filePath: "C:/tmp/bundle-1.zip",
    contentType: "application/zip",
    metadata: {
      packageId: "bundle-1",
      bundleId: "bundle-1",
    },
  });

  assert.deepEqual(calls, [
    {
      key: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
      filePath: "C:/tmp/bundle-1.zip",
      options: {
        blobHTTPHeaders: {
          blobContentType: "application/zip",
        },
        metadata: {
          packageId: "bundle-1",
          bundleId: "bundle-1",
        },
      },
    },
  ]);
  assert.deepEqual(result, {
    remoteKey: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
    remoteUrl:
      "https://example.invalid/witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
  });
});

test("AzureBlobObjectDelivery rejects missing Azure config", async () => {
  const connectionString = process.env.AZURE_BLOB_CONNECTION_STRING;
  const containerName = process.env.AZURE_BLOB_CONTAINER_NAME;

  delete process.env.AZURE_BLOB_CONNECTION_STRING;
  delete process.env.AZURE_BLOB_CONTAINER_NAME;

  try {
    const backend = new AzureBlobObjectDelivery();
    await assert.rejects(
      () =>
        backend.putObject({
          key: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
          filePath: "C:/tmp/bundle-1.zip",
          contentType: "application/zip",
        }),
      /Missing Azure Blob delivery config/i
    );
  } finally {
    if (connectionString === undefined) {
      delete process.env.AZURE_BLOB_CONNECTION_STRING;
    } else {
      process.env.AZURE_BLOB_CONNECTION_STRING = connectionString;
    }

    if (containerName === undefined) {
      delete process.env.AZURE_BLOB_CONTAINER_NAME;
    } else {
      process.env.AZURE_BLOB_CONTAINER_NAME = containerName;
    }
  }
});
