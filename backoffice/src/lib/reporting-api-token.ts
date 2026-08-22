import "server-only";

const DEFAULT_REPORTING_API_TOKEN =
  "rpt_live_3Jz9mQp7Vx2Lh8RbW6nYt4KcE1sUa5FdP0gHkXvNqZ";

export function getReportingApiToken() {
  return (
    process.env.BACKOFFICE_REPORTING_API_TOKEN?.trim() ||
    process.env.REPORTING_API_TOKEN?.trim() ||
    DEFAULT_REPORTING_API_TOKEN
  );
}
