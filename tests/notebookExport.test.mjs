import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const pdfModule = await loadModule('pdfExport.ts')
const notebook = await loadModule('notebookExport.ts')
const exporter = await loadModule('driveExport.ts')
const app = await readAppSource()
const filePanel = await readFile(new URL('../src/FilePanel.tsx', import.meta.url), 'utf8')
const auth = await readFile(new URL('../src/googleAuth.ts', import.meta.url), 'utf8')

const fakeJpeg = (size) => Uint8Array.from({ length: size }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : i % 251))
const text = (bytes) => Buffer.from(bytes).toString('latin1')

test('the PDF is well formed: header, one page per picture, and every cross-reference points at its object', () => {
  const pages = [
    { width: 640, height: 480.5, jpeg: fakeJpeg(300), pixelWidth: 1280, pixelHeight: 961 },
    { width: 100, height: 200, jpeg: fakeJpeg(77), pixelWidth: 200, pixelHeight: 400 },
  ]
  const bytes = pdfModule.buildPdf(pages)
  const pdf = text(bytes)
  assert.ok(pdf.startsWith('%PDF-1.4\n'))
  assert.ok(pdf.endsWith('%%EOF\n'))
  assert.match(pdf, /\/Type \/Pages \/Count 2 \/Kids \[3 0 R 6 0 R\]/)
  assert.match(pdf, /\/MediaBox \[0 0 640 480.5\]/)
  assert.match(pdf, /\/Filter \/DCTDecode \/Length 300 >>/)
  assert.match(pdf, /\/Width 200 \/Height 400 /)
  const xrefAt = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1])
  assert.equal(pdf.slice(xrefAt, xrefAt + 5), 'xref\n')
  const count = 2 + pages.length * 3
  const entries = pdf.slice(xrefAt).split('\n').slice(3, 3 + count)
  assert.equal(entries.length, count)
  entries.forEach((entry, index) => {
    assert.equal(entry.length + 1, 20, 'each cross-reference entry is 20 bytes')
    const at = Number(entry.slice(0, 10))
    assert.equal(pdf.slice(at, at + `${index + 1} 0 obj\n`.length), `${index + 1} 0 obj\n`)
  })
  // The JPEG bytes are stored untouched.
  const first = text(pages[0].jpeg)
  assert.ok(pdf.includes(`stream\n${first}\nendstream`))
})

test('a PDF needs at least one page', () => {
  assert.throws(() => pdfModule.buildPdf([]))
})

test('exported pages are 2 pixels per unit unless that is too large for a canvas', () => {
  assert.equal(notebook.exportPixelRatio(1000, 800), 2)
  const big = notebook.exportPixelRatio(2500, 3000)
  assert.ok(big < 2 && big > 0.5)
  assert.ok(2500 * big * 3000 * big <= notebook.EXPORT_MAX_PIXELS * 1.001)
  assert.ok(notebook.exportPixelRatio(20000, 100) * 20000 <= notebook.EXPORT_MAX_SIDE + 1e-6)
})

// A tiny stand-in for the Drive files API: folders and files with parents and app properties.
function fakeDriveFiles() {
  const files = []
  const calls = []
  let next = 1
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  const fetch = async (url, init = {}) => {
    const target = new URL(url)
    const method = init.method ?? 'GET'
    calls.push({ method, path: target.pathname, search: target.search })
    if (target.pathname === '/drive/v3/files' && method === 'GET') {
      const q = target.searchParams.get('q') ?? ''
      const matches = files.filter((file) => {
        if (file.trashed) return false
        if (q.includes("mimeType='application/vnd.google-apps.folder'")) return file.mimeType === 'application/vnd.google-apps.folder' && q.includes(`name='${file.name}'`)
        const parent = q.match(/'([^']+)' in parents/)?.[1]
        const docId = q.match(/value='([^']*)'/)?.[1]
        return file.parents?.includes(parent) && file.appProperties?.inkpadDocId === docId
      })
      return json({ files: matches.slice(0, 1).map((file) => ({ id: file.id, webViewLink: `https://drive.example/${file.id}` })) })
    }
    if (target.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(init.body)
      const file = { id: `f${next++}`, ...body }
      files.push(file)
      return json({ id: file.id })
    }
    if (target.pathname.startsWith('/upload/drive/v3/files')) {
      const raw = Buffer.from(await new Response(init.body).arrayBuffer()).toString('latin1')
      const metadata = JSON.parse(raw.match(/\r\n\r\n(\{.*?\})\r\n--/s)[1])
      assert.match(raw, /Content-Type: application\/pdf\r\n\r\n%PDF/)
      if (method === 'POST') {
        const file = { id: `f${next++}`, ...metadata, content: raw }
        files.push(file)
        return json({ id: file.id, webViewLink: `https://drive.example/${file.id}` })
      }
      const id = decodeURIComponent(target.pathname.split('/').pop())
      const file = files.find((item) => item.id === id)
      Object.assign(file, metadata, { content: raw })
      return json({ id, webViewLink: `https://drive.example/${id}` })
    }
    return json({}, 404)
  }
  return { files, calls, env: { fetch, getToken: async () => 'tok' } }
}
const pdf = () => Uint8Array.from(Buffer.from('%PDF-1.4\nfake'))

test('the first export creates the InkPad exports folder and one PDF in it, tied to the diagram', async () => {
  const drive = fakeDriveFiles()
  const result = await exporter.uploadDiagramPdf(drive.env, { docId: 'doc-1', name: 'Order flow.pdf', pdf: pdf() })
  assert.equal(result.updated, false)
  const folder = drive.files.find((file) => file.mimeType === 'application/vnd.google-apps.folder')
  assert.equal(folder.name, 'InkPad exports')
  const file = drive.files.find((item) => item.name === 'Order flow.pdf')
  assert.deepEqual(file.parents, [folder.id])
  assert.equal(file.mimeType, 'application/pdf')
  assert.equal(file.appProperties.inkpadDocId, 'doc-1')
})

test('exporting the same diagram again replaces its file (even renamed) instead of adding a second source', async () => {
  const drive = fakeDriveFiles()
  const first = await exporter.uploadDiagramPdf(drive.env, { docId: 'doc-1', name: 'Order flow.pdf', pdf: pdf() })
  const second = await exporter.uploadDiagramPdf(drive.env, { docId: 'doc-1', name: 'Order flow v2.pdf', pdf: pdf() })
  assert.equal(second.updated, true)
  assert.equal(second.fileId, first.fileId)
  const pdfs = drive.files.filter((file) => file.mimeType === 'application/pdf')
  assert.equal(pdfs.length, 1)
  assert.equal(pdfs[0].name, 'Order flow v2.pdf')
  assert.equal(drive.files.filter((file) => file.mimeType === 'application/vnd.google-apps.folder').length, 1, 'the folder is reused')
  assert.ok(drive.calls.some((call) => call.method === 'PATCH'))
})

test('a different diagram gets its own file in the same folder', async () => {
  const drive = fakeDriveFiles()
  await exporter.uploadDiagramPdf(drive.env, { docId: 'doc-1', name: 'A.pdf', pdf: pdf() })
  await exporter.uploadDiagramPdf(drive.env, { docId: 'doc-2', name: 'B.pdf', pdf: pdf() })
  assert.deepEqual(drive.files.filter((file) => file.mimeType === 'application/pdf').map((file) => file.name).sort(), ['A.pdf', 'B.pdf'])
})

test('ids with quotes cannot break out of the Drive search', async () => {
  const drive = fakeDriveFiles()
  await exporter.uploadDiagramPdf(drive.env, { docId: "it's", name: 'Q.pdf', pdf: pdf() })
  const search = drive.calls.filter((call) => call.method === 'GET').map((call) => decodeURIComponent(call.search)).join(' ')
  assert.ok(search.includes("value='it\\'s'"))
})

test('the export has its own sign-in with only the file scope, and the saving sign-in is unchanged', () => {
  assert.match(auth, /export const driveExportAuth = createGoogleAuth\(\{ scope: DRIVE_EXPORT_SCOPE, storageKey: 'inkpad\.drive\.exportToken' \}\)/)
  assert.match(auth, /scope: deps\.scope,/)
  assert.match(auth, /export const driveAuth = createGoogleAuth\(\)/)
})

test('the File panel button signs in first, then draws and uploads, and signing out of Drive also clears it', () => {
  assert.match(filePanel, /Export to Google Drive/)
  assert.match(filePanel, /disabled=\{!props\.canExport \|\| props\.exportBusy\}/)
  assert.match(app, /onExportNotebookLm=\{\(\) => void exportToNotebookLm\(\)\}/)
  const body = app.slice(app.indexOf('const exportToNotebookLm'))
  assert.ok(body.indexOf('driveExportAuth.getToken(false, true)') < body.indexOf('renderDiagramPdf('))
  assert.ok(body.indexOf('renderDiagramPdf(') < body.indexOf('uploadDiagramPdf('))
  assert.match(app, /driveAuth\.signOut\(\)\n\s+driveExportAuth\.signOut\(\)/)
})
