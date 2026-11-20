/** Ids for new records are made on the device so retries and offline writes never duplicate. */
export const newId = (): string => crypto.randomUUID();
