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
