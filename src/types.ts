// src/types.ts
export type ImageSource = string | Buffer; // path or raw bytes

export interface ResizedImage {
  content: Buffer;
  filename: string;
  contentType: string; // e.g. 'image/jpeg'
}

export interface Brand {
  id: string;
  name: string;
}
export interface Model {
  id: string;
  name: string;
}

export type Collection = 'My Collection' | 'Parting Out' | 'Sightings';

export interface MachineInput {
  collection: Collection;
  brand: string | Brand; // resolved to cat_id
  model: string | Model; // existing Model (id) or a new name (string)
  year: string; // TWDB gallery_name
  serialNo: string;
  description: string; // gallery_desc
  coverImage?: ImageSource; // resized before upload
  typeSampleImage?: ImageSource;
  watermark?: boolean; // default true
}

export interface MachineRef {
  id: string;
  url: string;
}
