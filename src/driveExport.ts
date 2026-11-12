import { driveRequest, type DriveEnv } from './googleDrive'

/**
 * Puts one diagram's PDF into the person's normal Google Drive so NotebookLM can import it.
 * All exports live in one folder, one file per diagram. A file is tied to its diagram by an app property (the diagram's id),
 * so exporting again replaces that same file (NotebookLM keeps one source) even after the diagram was renamed.
 */

export const EXPORT_FOLDER_NAME = 'InkPad exports'
export const EXPORT_DOC_PROPERTY = 'inkpadDocId'

const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

type Found = { id: string; webViewLink?: string }

const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function firstMatch(env: DriveEnv, query: string): Promise<Found | null> {
  const params = new URLSearchParams({ q: query, pageSize: '1', fields: 'files(id,webViewLink)' })
  const data = await (await driveRequest(env, `${FILES_URL}?${params}`)).json() as { files?: Found[] }
  return data.files?.[0] ?? null
}

async function ensureFolder(env: DriveEnv): Promise<string> {
  const existing = await firstMatch(env, `mimeType='${FOLDER_MIME}' and name='${quote(EXPORT_FOLDER_NAME)}' and 'root' in parents and trashed=false`)
  if (existing) return existing.id
  const created = await (await driveRequest(env, `${FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: EXPORT_FOLDER_NAME, mimeType: FOLDER_MIME }),
  })).json() as { id: string }
  return created.id
}

function multipartPdf(metadata: object, pdf: Uint8Array) {
  const boundary = `inkpad${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  return { body: new Blob([head, pdf, `\r\n--${boundary}--`]), headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } }
}

export type DriveExportResult = { fileId: string; updated: boolean; link: string | null }

/** Creates `<name>` in the InkPad exports folder, or replaces the file this diagram was exported to before. */
export async function uploadDiagramPdf(env: DriveEnv, input: { docId: string; name: string; pdf: Uint8Array }): Promise<DriveExportResult> {
  const folderId = await ensureFolder(env)
  const existing = await firstMatch(env, `'${folderId}' in parents and appProperties has { key='${EXPORT_DOC_PROPERTY}' and value='${quote(input.docId)}' } and trashed=false`)
  const appProperties = { [EXPORT_DOC_PROPERTY]: input.docId }
  const fields = 'id,webViewLink'
  if (existing) {
    const { body, headers } = multipartPdf({ name: input.name, appProperties }, input.pdf)
    const data = await (await driveRequest(env, `${UPLOAD_URL}/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=${fields}`, { method: 'PATCH', headers, body })).json() as Found
    return { fileId: data.id, updated: true, link: data.webViewLink ?? null }
  }
  const { body, headers } = multipartPdf({ name: input.name, mimeType: 'application/pdf', parents: [folderId], appProperties }, input.pdf)
  const data = await (await driveRequest(env, `${UPLOAD_URL}?uploadType=multipart&fields=${fields}`, { method: 'POST', headers, body })).json() as Found
  return { fileId: data.id, updated: false, link: data.webViewLink ?? null }
}
