export const NATIVE_SERVICE_TRANSACTION_NOTIFICATION_CONTRACT_SOURCE =
  "pocket_genes_services_wiki_v1";

export const NATIVE_SERVICE_TRANSACTION_NOTIFICATION_ID_PATTERN =
  /^pgr_(ios|android)_[a-f0-9]{32}$/;

export type NativeServiceTransactionPlatform = "ios" | "android";

export function nativeServiceTransactionPlatform(
  transactionId: string,
): NativeServiceTransactionPlatform | null {
  const match = transactionId.match(
    NATIVE_SERVICE_TRANSACTION_NOTIFICATION_ID_PATTERN,
  );
  return match?.[1] === "ios" || match?.[1] === "android" ? match[1] : null;
}
