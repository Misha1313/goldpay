export class AppError extends Error {
  private code: string;
  constructor(message, code) {
    super(message);

    this.name = 'AppError';
    this.code = code;

    // Fix prototype chain (important when targeting older JS)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
