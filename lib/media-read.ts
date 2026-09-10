/* eslint-disable no-console */
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const MEDIA_DIR = path.join(DATA_DIR, 'media');

export function isLocalFile(identifier: string): boolean {
  return identifier.startsWith('file:');
}

export async function readMediaFile(
  identifier: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const filename = identifier.startsWith('file:')
      ? identifier.slice(5)
      : path.basename(identifier);
    const filepath = path.join(MEDIA_DIR, filename);
    const buffer = await fsp.readFile(filepath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };

    return { buffer, mimeType: mimeTypes[ext] || 'application/octet-stream' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('[MediaStorage] Failed to read file:', error);
    return null;
  }
}

export async function readConventionReferenceFile(
  generationId: string,
  index: number
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  for (const ext of extensions) {
    const file = await readMediaFile(`file:${generationId}-ref-${index}.${ext}`);
    if (file) return file;
  }
  return null;
}

export function deleteMediaFile(identifier: string): boolean {
  try {
    if (!identifier.startsWith('file:')) {
      return false;
    }

    const filename = identifier.slice(5);
    const filepath = path.join(MEDIA_DIR, filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`[MediaStorage] Deleted: ${filename}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[MediaStorage] Failed to delete file:', error);
    return false;
  }
}
