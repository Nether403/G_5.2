import { BlobServiceClient } from "@azure/storage-blob";

import type {
  ObjectDeliveryBackend,
  PutObjectInput,
  PutObjectResult,
} from "./objectDelivery";

interface BlobServiceClientLike {
  getContainerClient(containerName: string): {
    getBlockBlobClient(key: string): {
      url: string;
      uploadFile(
        filePath: string,
        options: {
          blobHTTPHeaders: { blobContentType: string };
          metadata?: Record<string, string>;
        }
      ): Promise<unknown>;
    };
  };
}

export interface AzureBlobObjectDeliveryOptions {
  connectionString?: string;
  containerName?: string;
  createBlobServiceClient?: (
    connectionString: string
  ) => BlobServiceClientLike;
}

function getRequiredConfigValue(name: string, value?: string): string {
  const trimmed = value?.trim() ?? process.env[name]?.trim();
  if (!trimmed) {
    throw new Error(`Missing Azure Blob delivery config: ${name}`);
  }
  return trimmed;
}

export class AzureBlobObjectDelivery implements ObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  constructor(
    private readonly options: AzureBlobObjectDeliveryOptions = {}
  ) {}

  private createBlobServiceClient(connectionString: string): BlobServiceClientLike {
    if (this.options.createBlobServiceClient) {
      return this.options.createBlobServiceClient(connectionString);
    }
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const connectionString = getRequiredConfigValue(
      "AZURE_BLOB_CONNECTION_STRING",
      this.options.connectionString
    );
    const containerName = getRequiredConfigValue(
      "AZURE_BLOB_CONTAINER_NAME",
      this.options.containerName
    );

    const serviceClient = this.createBlobServiceClient(connectionString);
    const containerClient = serviceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(input.key);

    await blobClient.uploadFile(input.filePath, {
      blobHTTPHeaders: {
        blobContentType: input.contentType,
      },
      metadata: input.metadata,
    });

    return {
      remoteKey: input.key,
      remoteUrl: blobClient.url,
    };
  }
}
