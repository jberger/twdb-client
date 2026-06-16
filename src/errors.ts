// src/errors.ts
export class TwdbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthError extends TwdbError {}

export class HttpError extends TwdbError {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ParseError extends TwdbError {}

export class TwdbValidationError extends TwdbError {
  problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.problems = problems;
  }
}

export class UploadTooLargeError extends TwdbError {}
