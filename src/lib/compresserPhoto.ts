// Compression des photos de chèques / bordereaux avant envoi : côté le plus long ~2000 px,
// JPEG qualité 0,8, orientation EXIF corrigée. Les PDF (et tout ce qui n'est pas une image) sont laissés tels quels.

const COTE_MAX = 2000;
const QUALITE = 0.8;

export async function compresserPhoto(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || typeof createImageBitmap !== "function") return f;
  let bmp: ImageBitmap;
  try {
    // « from-image » applique l'orientation EXIF (photos de téléphone).
    bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
  } catch {
    return f; // format non décodable par le navigateur (ex. HEIC sur certains navigateurs) : envoi d'origine
  }
  const k = Math.min(1, COTE_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return f;
  ctx.fillStyle = "#fff"; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITE));
  if (!blob || blob.size >= f.size) return f; // déjà plus léger : on garde l'original
  return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
}
