export interface StorageProvider {
  describe(storageKey: string): Promise<{ storageKey: string }>;
}

export class MetadataOnlyStorageProvider implements StorageProvider {
  async describe(storageKey: string) {
    return { storageKey };
  }
}

export const storageProvider = new MetadataOnlyStorageProvider();
