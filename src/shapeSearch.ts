/** Shape search: tech names (redis, kafka, s3, nginx...) mapped to the insertable shapes. Pure; used by the More shapes grid, the Insert tray and the command palette. */

export type ShapeSearchEntry = { id: string; name: string; aliases: string[] }
export type ShapeSearchMatch = { id: string; name: string; /** The alias that matched, or null when the name itself matched (or the query is empty). */ alias: string | null; rank: number }

/** Every insertable shape, in tray order: basics first, then the HLD shapes (database, queue, service, then the More shapes grid). HLD ids are HldShape values. */
export const SHAPE_SEARCH_TABLE: ShapeSearchEntry[] = [
  { id: 'text', name: 'Text label', aliases: ['text', 'label', 'caption', 'title'] },
  { id: 'shapes', name: 'Shapes and arrows', aliases: ['rectangle', 'box', 'square', 'diamond', 'decision', 'ellipse', 'circle', 'oval', 'arrow', 'line', 'connector'] },
  { id: 'sticky', name: 'Sticky note', aliases: ['sticky', 'note', 'post-it', 'postit', 'comment'] },
  { id: 'classBox', name: 'Typed class box', aliases: ['class', 'class box', 'uml', 'lld', 'interface', 'code block', 'code', 'entity'] },
  { id: 'database', name: 'Database', aliases: ['postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongo', 'dynamodb', 'cassandra', 'sql', 'nosql', 'rds', 'db', 'oracle', 'sqlite', 'aurora'] },
  { id: 'queue', name: 'Queue', aliases: ['sqs', 'rabbitmq', 'activemq', 'celery', 'amqp', 'message queue', 'fifo', 'mq'] },
  { id: 'service', name: 'Service', aliases: ['microservice', 'backend', 'api', 'app server', 'rest', 'grpc'] },
  { id: 'user', name: 'User', aliases: ['client', 'actor', 'person', 'customer', 'human'] },
  { id: 'browser', name: 'Browser', aliases: ['web', 'frontend', 'spa', 'chrome', 'react', 'website'] },
  { id: 'mobile', name: 'Mobile', aliases: ['android', 'ios', 'app', 'phone', 'iphone', 'tablet'] },
  { id: 'cache', name: 'Cache', aliases: ['redis', 'memcached', 'elasticache', 'valkey', 'in-memory', 'ttl'] },
  { id: 'loadBalancer', name: 'Load balancer', aliases: ['nginx', 'elb', 'alb', 'nlb', 'haproxy', 'envoy', 'lb', 'reverse proxy', 'proxy'] },
  { id: 'cdn', name: 'CDN', aliases: ['cloudfront', 'akamai', 'cloudflare', 'fastly', 'edge', 'content delivery'] },
  { id: 'apiGateway', name: 'API gateway', aliases: ['kong', 'apigee', 'gateway', 'api management', 'ingress'] },
  { id: 'server', name: 'Server', aliases: ['ec2', 'vm', 'host', 'instance', 'container', 'pod', 'docker', 'kubernetes', 'machine'] },
  { id: 'objectStorage', name: 'Object storage', aliases: ['s3', 'blob', 'gcs', 'bucket', 'minio', 'azure blob', 'file storage'] },
  { id: 'stream', name: 'Stream', aliases: ['kafka', 'kinesis', 'pulsar', 'event stream', 'pubsub', 'pub/sub', 'event log', 'redpanda', 'eventhub'] },
  { id: 'worker', name: 'Worker', aliases: ['lambda', 'cron', 'job', 'consumer', 'function', 'batch', 'background', 'scheduler'] },
]

/** Lowest rank wins: 0 exact name, 1 name prefix, 2 alias exact, 3 alias prefix, 4 substring of name or alias. Ties keep table (tray) order. An empty query returns everything in tray order. */
export function searchShapes(query: string, table: ShapeSearchEntry[] = SHAPE_SEARCH_TABLE): ShapeSearchMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return table.map((entry) => ({ id: entry.id, name: entry.name, alias: null, rank: 0 }))
  const out: Array<ShapeSearchMatch & { order: number }> = []
  table.forEach((entry, order) => {
    const name = entry.name.toLowerCase()
    let bestRank = Infinity
    let bestAlias: string | null = null
    if (name === q) bestRank = 0
    else if (name.startsWith(q)) bestRank = 1
    else if (name.includes(q)) bestRank = 4
    for (const alias of entry.aliases) {
      const a = alias.toLowerCase()
      const rank = a === q ? 2 : a.startsWith(q) ? 3 : a.includes(q) ? 4 : Infinity
      if (rank < bestRank) { bestRank = rank; bestAlias = alias }
    }
    if (bestRank !== Infinity) out.push({ id: entry.id, name: entry.name, alias: bestAlias, rank: bestRank, order })
  })
  out.sort((a, b) => a.rank - b.rank || a.order - b.order)
  return out.map(({ order: _order, ...match }) => match)
}

/** "Cache · redis" for display; just the name when no alias matched. */
export function shapeMatchLabel(match: ShapeSearchMatch): string {
  return match.alias ? `${match.name} · ${match.alias}` : match.name
}

/** Space-separated aliases for command palette keywords. */
export function shapeKeywords(id: string, table: ShapeSearchEntry[] = SHAPE_SEARCH_TABLE): string {
  return table.find((entry) => entry.id === id)?.aliases.join(' ') ?? ''
}
