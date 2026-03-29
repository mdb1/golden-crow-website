export class AdminRepositoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "AdminRepositoryError";
  }
}

export function isAdminRepositoryError(
  error: unknown
): error is AdminRepositoryError {
  return error instanceof AdminRepositoryError;
}
