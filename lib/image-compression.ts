const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export async function compressImageToWebP(file: File): Promise<File> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Image size must be <= ${MAX_FILE_SIZE_MB}MB`);
  }

  const options = {
    maxSizeMB: 15,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
  };

  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, options);
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
