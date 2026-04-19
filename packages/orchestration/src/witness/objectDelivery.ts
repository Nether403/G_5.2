export interface PutObjectInput {
  key: string;
  filePath: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  remoteKey: string;
  remoteUrl?: string;
}

export type ObjectDeliveryBackendName = "azure-blob";

export interface ObjectDeliveryBackend {
  name: ObjectDeliveryBackendName;
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
}

import { AzureBlobObjectDelivery } from "./azureBlobObjectDelivery";

export function getPublicationObjectDeliveryBackend(
  backendName: ObjectDeliveryBackend["name"]
): ObjectDeliveryBackend {
  switch (backendName) {
    case "azure-blob":
      return new AzureBlobObjectDelivery();
    default:
      throw new Error(
        `Unknown publication object delivery backend: ${backendName as string}`
      );
  }
}
