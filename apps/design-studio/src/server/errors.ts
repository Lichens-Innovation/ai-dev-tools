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

export const conflict = (message: string) =>
  new DesignError('Conflict', message)
export const notFound = (message: string) =>
  new DesignError('NotFound', message)
export const invalid = (message: string) => new DesignError('Invalid', message)
