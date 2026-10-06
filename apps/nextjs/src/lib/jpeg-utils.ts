/**
 * Vérifie si un blob JPEG se termine par le marqueur FF D9.
 */
export async function jpegAUnMarqueurFinal(blob: Blob): Promise<boolean> {
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 2) return false;
    return bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  } catch {
    return false;
  }
}