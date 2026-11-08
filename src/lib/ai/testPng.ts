import { crc32, deflateSync } from 'node:zlib'

/**
 * A PNG for the contract tests (node only): a white field with a solid square of one colour in the middle, so a
 * model that can see the image answers with the colour and one that can't, can't.
 */
export function squarePng(rgb: [number, number, number], size = 96): string {
  const row = 1 + size * 3
  const raw = Buffer.alloc(row * size, 255)
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0 // no filter
    for (let x = 0; x < size; x++) {
      const inside = x > size / 4 && x < (size * 3) / 4 && y > size / 4 && y < (size * 3) / 4
      if (!inside) continue
      const o = y * row + 1 + x * 3
      raw[o] = rgb[0]
      raw[o + 1] = rgb[1]
      raw[o + 2] = rgb[2]
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0)
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png.toString('base64')
}
