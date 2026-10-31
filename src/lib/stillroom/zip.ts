export type ZipEntry = { path: string; data: Uint8Array };

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const files = entries.map((entry) => ({
    name: new TextEncoder().encode(entry.path),
    data: entry.data,
    crc: crc32(entry.data),
  }));
  let size = 22;
  for (const file of files) size += 30 + file.name.length + file.data.length + 46 + file.name.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  const locals: number[] = [];
  for (const file of files) {
    locals.push(offset);
    u32(view, offset, 0x04034b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 6, 0x0800);
    u16(view, offset + 8, 0);
    u16(view, offset + 10, 0);
    u16(view, offset + 12, 0);
    u32(view, offset + 14, file.crc);
    u32(view, offset + 18, file.data.length);
    u32(view, offset + 22, file.data.length);
    u16(view, offset + 26, file.name.length);
    u16(view, offset + 28, 0);
    out.set(file.name, offset + 30);
    out.set(file.data, offset + 30 + file.name.length);
    offset += 30 + file.name.length + file.data.length;
  }
  const central = offset;
  files.forEach((file, index) => {
    u32(view, offset, 0x02014b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 6, 20);
    u16(view, offset + 8, 0x0800);
    u16(view, offset + 10, 0);
    u16(view, offset + 12, 0);
    u16(view, offset + 14, 0);
    u32(view, offset + 16, file.crc);
    u32(view, offset + 20, file.data.length);
    u32(view, offset + 24, file.data.length);
    u16(view, offset + 28, file.name.length);
    u16(view, offset + 30, 0);
    u16(view, offset + 32, 0);
    u16(view, offset + 34, 0);
    u16(view, offset + 36, 0);
    u32(view, offset + 38, 0);
    u32(view, offset + 42, locals[index]);
    out.set(file.name, offset + 46);
    offset += 46 + file.name.length;
  });
  u32(view, offset, 0x06054b50);
  u16(view, offset + 8, files.length);
  u16(view, offset + 10, files.length);
  u32(view, offset + 12, offset - central);
  u32(view, offset + 16, central);
  return out;
}
