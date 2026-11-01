import type { ConnectorRelationshipType } from '../canvasModel'

export function UmlConnectorIcon({ type }: { type: ConnectorRelationshipType }) {
  const dashed = type === 'realization' || type === 'dependency'
  const marker = type === 'inheritance' || type === 'realization'
    ? <path d="M27 7 19 2 19 12Z" fill="var(--uml-marker-fill, #ffffff)" />
    : type === 'directed-association' || type === 'dependency'
      ? <path d="m20 2 7 5-7 5" fill="none" />
      : type === 'aggregation' || type === 'composition'
        ? <path d="M2 7 8 2 14 7 8 12Z" fill={type === 'composition' ? 'currentColor' : '#ffffff'} />
        : null
  const line = type === 'aggregation' || type === 'composition' ? 'M14 7H28' : marker ? 'M2 7H19' : 'M2 7H28'
  return (
    <svg className={`uml-tool-icon${dashed ? ' dashed' : ''}`} viewBox="0 0 30 14" aria-hidden="true">
      <path className="uml-tool-line" d={line} />
      {marker}
    </svg>
  )
}

