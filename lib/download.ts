'use client';

/**
 * Converts a base64 data URL to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: mimeType });
}

/**
 * Fetches a remote asset as a blob and triggers a client-side download.
 * Supports both remote URLs and base64 data URLs.
 */
export async function downloadAsset(url: string, filename: string): Promise<void> {
  let blob: Blob;

  if (url.startsWith('data:')) {
    // Handle base64 data URL directly
    blob = dataUrlToBlob(url);
  } else {
    // Fetch remote URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    blob = await response.blob();
  }

  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  link.remove();
  URL.revokeObjectURL(objectUrl);
}
