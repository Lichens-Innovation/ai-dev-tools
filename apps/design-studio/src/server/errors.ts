export type DesignErrorCode = 'Conflict' | 'NotFound' | 'Invalid'

export class DesignError extends Error {
  constructor(
    readonly code: DesignErrorCode,
    message: string,
  ) {
    super(message)
    this.name = code
  }
}

/**
 * A DesignError, also when the class was loaded twice (dev reloads re-evaluate modules, so `instanceof` can fail
 * between the singleton project and a freshly loaded server function).
 */
export const isDesignError = (error: unknown): error is DesignError =>
  error instanceof DesignError ||
  (error instanceof Error &&
    ['Conflict', 'NotFound', 'Invalid'].includes(error.name) &&
    'code' in error)

export const conflict = (message: string) =>
  new DesignError('Conflict', message)
export const notFound = (message: string) =>
  new DesignError('NotFound', message)
export const invalid = (message: string) => new DesignError('Invalid', message)
