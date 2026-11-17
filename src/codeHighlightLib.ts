import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import kotlin from 'highlight.js/lib/languages/kotlin'
import sql from 'highlight.js/lib/languages/sql'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'

/** Only ever loaded through the dynamic import in codeHighlight.ts, so highlight.js is its own chunk. */
const GRAMMARS: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = { javascript, typescript, python, java, csharp, cpp, go, rust, kotlin, sql, json, yaml, bash, xml, css }
for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar)

export function highlightWithLibrary(code: string, language: string): string | null {
  const name = language === 'html' ? 'xml' : language
  if (!hljs.getLanguage(name)) return null
  return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
}
