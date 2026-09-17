"use client";

/**
 * SEC-02 현장 사진 — 캔버스로 다시 그려 EXIF(위치·기기 정보)를 제거하고 256px 썸네일만 기기에 보관한다.
 * 원본은 어디에도 저장하지 않는다. 10MB 초과·이미지 아님은 거부.
 */
export async function stripExifThumbnail(file: File, max = 256): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("jpg/png 이미지만 올릴 수 있어요");
  if (file.size > 10 * 1024 * 1024) throw new Error("10MB 이하 이미지만 올릴 수 있어요");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
