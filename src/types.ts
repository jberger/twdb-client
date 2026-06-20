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

/** A photo in a TWDB gallery. `photoId` is TWDB's gp_id; `url` is the stored image URL. */
export interface PhotoRef {
  photoId: string;
  url: string;
}

/** Options for adding a photo. Defaults: watermark on, published. */
export interface AddPhotoOptions {
  description?: string;
  watermark?: boolean;
  publish?: boolean;
}

/** Options for editing a photo. NOTE: this submits photo_desc/watermark/published each call
 *  (the TWDB edit form is not a partial update) — pass `description` to avoid clearing it.
 *  Defaults preserve watermark + published. Provide `image` to replace the photo bytes. */
export interface UpdatePhotoOptions {
  description?: string;
  watermark?: boolean;
  publish?: boolean;
  image?: ImageSource;
}

/** An external link on a TWDB machine. `id` is TWDB's weblink id (used for delete). */
export interface WebLink {
  id: string;
  name: string;
  url: string;
}
