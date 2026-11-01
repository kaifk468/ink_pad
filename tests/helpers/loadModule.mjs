import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const urls = new Map()

/**
 * Loads a src/*.ts module for tests: transpiles it and swaps each relative import for the
 * (recursively transpiled) module, so modules that depend on each other can be tested in Node.
 * Paths are relative to src/, e.g. loadModule('textLayout.ts'). Import cycles are not supported.
 */
export async function loadModule(path) {
  const url = await moduleUrl(path)
  return import(url)
}

async function moduleUrl(path) {
  if (urls.has(path)) return urls.get(path)
  const source = await readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
  for (const match of [...output.matchAll(/from '(\.\.?\/[^']+)'/g)]) {
    const resolved = new URL(match[1] + '.ts', `file:///${directory}`).pathname.slice(1)
    output = output.replace(`from '${match[1]}'`, `from '${await moduleUrl(resolved)}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  urls.set(path, url)
  return url
}
