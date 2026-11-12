/**
 * A minimal PDF writer: every page is one picture (a JPEG, stored as-is) scaled to fill the page.
 * No library is needed because a JPEG can be placed in a PDF without re-encoding (DCTDecode).
 */

export type PdfPageImage = {
  /** Page size in PDF points (the picture is stretched to fill it). */
  width: number
  height: number
  /** The JPEG file's bytes. */
  jpeg: Uint8Array
  /** The JPEG's size in pixels. */
  pixelWidth: number
  pixelHeight: number
}

const encoder = new TextEncoder()
const num = (value: number) => String(Math.round(value * 100) / 100)

export function buildPdf(pages: PdfPageImage[]): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.')
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const begin = (id: number) => {
    offsets[id - 1] = length
    push(`${id} 0 obj\n`)
  }

  // Object numbers: 1 catalog, 2 page tree, then for each page: the page, its content stream and its picture.
  const pageId = (index: number) => 3 + index * 3
  push('%PDF-1.4\n%âãÏÓ\n')
  begin(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  begin(2)
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] >>\nendobj\n`)

  pages.forEach((page, index) => {
    const id = pageId(index)
    const content = `q\n${num(page.width)} 0 0 ${num(page.height)} 0 0 cm\n/Im0 Do\nQ\n`
    begin(id)
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>\nendobj\n`)
    begin(id + 1)
    push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)
    begin(id + 2)
    push(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`)
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  const objectCount = 2 + pages.length * 3
  const xrefAt = length
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`)
  for (let id = 1; id <= objectCount; id += 1) push(`${String(offsets[id - 1]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
