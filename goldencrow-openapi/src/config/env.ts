function optionalTrimmed(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const ENV = {
  PORT: Number(process.env.PORT ?? "4010"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  GOLDENCROW_OPENAPI_PUBLIC_URL: trimTrailingSlash(
    optionalTrimmed(process.env.GOLDENCROW_OPENAPI_PUBLIC_URL) ??
      "http://localhost:4010",
  ),
  GOLDENCROW_SDK_URL: trimTrailingSlash(
    optionalTrimmed(process.env.GOLDENCROW_SDK_URL) ??
      "http://localhost:3000",
  ),
  GOLDENCROW_OPENAPI_INTERNAL_TOKEN: optionalTrimmed(
    process.env.GOLDENCROW_OPENAPI_INTERNAL_TOKEN,
  ),
  REPORTING_API_TOKEN: optionalTrimmed(process.env.REPORTING_API_TOKEN),
};
