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
export { isValidTwdbYear } from './validate.js';
export { resolveExact, suggestMatch, suggestTwdbYear } from './resolve.js';
export { levenshtein, similarity, fuzzyBestMatch, inferMake, inferModel } from './fuzzy.js';
export type { FuzzyMatch } from './fuzzy.js';
export type {
  AddPhotoOptions,
  MachineInput,
  MachineRef,
  Brand,
  Model,
  Collection,
  ImageSource,
  PhotoRef,
  RemoteMachine,
  ResizedImage,
  UpdatePhotoOptions,
  WebLink,
} from './types.js';
