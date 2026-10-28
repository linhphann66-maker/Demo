/** Read dimensions before browser decode so a small compressed image cannot allocate an unbounded surface. */
export function rasterDimensions(raw: string): {
  width: number;
  height: number;
} {
  const b = (i: number) => {
    if (i < 0 || i >= raw.length) throw Error("Ảnh bị cắt ngắn");
    return raw.charCodeAt(i);
  };
  const be16 = (i: number) => (b(i) << 8) | b(i + 1);
  const le16 = (i: number) => b(i) | (b(i + 1) << 8);
  const le24 = (i: number) => le16(i) | (b(i + 2) << 16);
  const be32 = (i: number) =>
    b(i) * 2 ** 24 + b(i + 1) * 2 ** 16 + b(i + 2) * 256 + b(i + 3);
  let width = 0,
    height = 0;
  if (raw.startsWith("\x89PNG\r\n\x1a\n")) {
    if (raw.slice(12, 16) !== "IHDR") throw Error("PNG không hợp lệ");
    width = be32(16);
    height = be32(20);
  } else if (raw.startsWith("\xff\xd8\xff")) {
    let i = 2;
    while (i < raw.length) {
      if (b(i++) !== 255) throw Error("JPEG không hợp lệ");
      while (b(i) === 255) i++;
      const marker = b(i++);
      if (marker === 217 || marker === 218) break;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215))
        continue;
      const len = be16(i);
      if (len < 2 || i + len > raw.length) throw Error("JPEG bị cắt ngắn");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = be16(i + 3);
        width = be16(i + 5);
        break;
      }
      i += len;
    }
  } else if (raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP") {
    const chunk = raw.slice(12, 16),
      i = 20;
    if (chunk === "VP8X") {
      width = le24(i + 4) + 1;
      height = le24(i + 7) + 1;
    } else if (chunk === "VP8L" && b(i) === 47) {
      width = ((b(i + 1) | (b(i + 2) << 8)) & 16383) + 1;
      height =
        (((b(i + 2) >> 6) | (b(i + 3) << 2) | (b(i + 4) << 10)) & 16383) + 1;
    } else if (chunk === "VP8 " && raw.slice(i + 3, i + 6) === "\x9d\x01\x2a") {
      width = le16(i + 6) & 16383;
      height = le16(i + 8) & 16383;
    }
  }
  if (width < 1 || height < 1 || width > 4096 || height > 4096)
    throw Error("Ảnh phải có kích thước từ 1 đến 4096 px");
  return { width, height };
}
