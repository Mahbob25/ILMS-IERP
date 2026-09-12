/**
 * Downscale an image in the browser before uploading it.
 *
 * A phone camera shot is several megabytes while the avatar never renders larger
 * than ~64px, so sending the original wastes bandwidth and risks the hosting
 * layer's request-body limit. Falls back to the original file whenever the
 * browser cannot decode or re-encode it: the server validates whatever it
 * receives, so a failed resize must never block the upload.
 */
export async function prepareImageFile(
  file: File,
  maxSize = 512,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
