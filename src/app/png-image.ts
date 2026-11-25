const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export async function decodePng(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export async function decodePngFile(file: File): Promise<ImageData> {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!PNG_SIGNATURE.every((b, i) => signature[i] === b)) {
    throw new Error(`${file.name} is not a PNG file.`);
  }
  try {
    return await decodePng(file);
  } catch {
    throw new Error(`${file.name} could not be read as a PNG image.`);
  }
}
