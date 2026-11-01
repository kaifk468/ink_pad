import { readdir, readFile } from 'node:fs/promises'

/**
 * The app is split across src/App.tsx and src/app/*. Wiring tests assert that certain code exists
 * in "the app", so they read App.tsx followed by every module under src/app/ (sorted, stable order).
 */
export async function readAppSource() {
  const parts = [await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8')]
  const directory = new URL('../../src/app/', import.meta.url)
  for (const name of (await readdir(directory)).filter((file) => /\.(ts|tsx)$/.test(file)).sort()) {
    parts.push(await readFile(new URL(name, directory), 'utf8'))
  }
  return parts.join('\n')
}
