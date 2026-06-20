// src/index.ts
export { TwdbClient } from './client.js';
export type { TwdbClientOptions, SerializedSession } from './client.js';
export {
  TwdbError,
  AuthError,
  HttpError,
  ParseError,
  TwdbValidationError,
  UploadTooLargeError,
} from './errors.js';
export { resizeForGallery, resizeForTypeSample } from './resize.js';
export type {
  AddPhotoOptions,
  MachineInput,
  MachineRef,
  Brand,
  Model,
  Collection,
  ImageSource,
  PhotoRef,
  ResizedImage,
  UpdatePhotoOptions,
} from './types.js';
