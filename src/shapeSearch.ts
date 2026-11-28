/** Shape search: tech names (redis, kafka, s3, nginx...) mapped to the insertable shapes. Pure; used by the More shapes grid, the Insert tray and the command palette. */

export type ShapeSearchEntry = { id: string; name: string; aliases: string[] }
export type ShapeSearchMatch = { id: string; name: string; /** The alias that matched, or null when the name itself matched (or the query is empty). */ alias: string | null; rank: number }

/** Every insertable shape, in tray order: basics first, then the HLD shapes (database, queue, service, then the More shapes grid). HLD ids are HldShape values. */
export const SHAPE_SEARCH_TABLE: ShapeSearchEntry[] = [
  { id: 'text', name: 'Text label', aliases: ['text', 'label', 'caption', 'title'] },
  { id: 'shapes', name: 'Shapes and arrows', aliases: ['rectangle', 'box', 'square', 'diamond', 'decision', 'ellipse', 'circle', 'oval', 'arrow', 'line', 'connector'] },
  { id: 'sticky', name: 'Sticky note', aliases: ['sticky', 'note', 'post-it', 'postit', 'comment'] },
  { id: 'classBox', name: 'Typed class box', aliases: ['class', 'class box', 'uml', 'lld', 'interface', 'code block', 'code', 'entity'] },
  { id: 'database', name: 'Database', aliases: ['postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongo', 'dynamodb', 'cassandra', 'sql', 'nosql', 'rds', 'db', 'oracle', 'sqlite', 'aurora', 'aws', 'amazon', 'azure', 'gcp', 'dynamodb', 'cosmos db', 'azure sql', 'cloud sql', 'bigtable', 'spanner'] },
  { id: 'queue', name: 'Queue', aliases: ['sqs', 'rabbitmq', 'activemq', 'celery', 'amqp', 'message queue', 'fifo', 'mq', 'aws', 'amazon', 'azure', 'service bus', 'azure queue', 'sns', 'cloud tasks'] },
  { id: 'service', name: 'Service', aliases: ['microservice', 'backend', 'api', 'app server', 'rest', 'grpc'] },
  { id: 'user', name: 'User', aliases: ['client', 'actor', 'person', 'customer', 'human'] },
  { id: 'browser', name: 'Browser', aliases: ['web', 'frontend', 'spa', 'chrome', 'react', 'website'] },
  { id: 'mobile', name: 'Mobile', aliases: ['android', 'ios', 'app', 'phone', 'iphone', 'tablet'] },
  { id: 'cache', name: 'Cache', aliases: ['redis', 'memcached', 'elasticache', 'valkey', 'in-memory', 'ttl', 'aws', 'azure', 'azure cache', 'memorystore'] },
  { id: 'loadBalancer', name: 'Load balancer', aliases: ['nginx', 'elb', 'alb', 'nlb', 'haproxy', 'envoy', 'lb', 'reverse proxy', 'proxy', 'aws', 'azure', 'gcp', 'application gateway', 'front door'] },
  { id: 'cdn', name: 'CDN', aliases: ['cloudfront', 'akamai', 'cloudflare', 'fastly', 'edge', 'content delivery', 'aws', 'azure', 'azure cdn', 'cloud cdn'] },
  { id: 'apiGateway', name: 'API gateway', aliases: ['kong', 'apigee', 'gateway', 'api management', 'ingress', 'aws', 'azure', 'gcp', 'api gateway', 'apim', 'app sync'] },
  { id: 'server', name: 'Server', aliases: ['ec2', 'vm', 'host', 'instance', 'container', 'pod', 'docker', 'kubernetes', 'machine', 'aws', 'amazon', 'azure', 'gcp', 'azure vm', 'virtual machine', 'compute engine', 'eks', 'aks', 'gke', 'ecs', 'fargate'] },
  { id: 'objectStorage', name: 'Object storage', aliases: ['s3', 'blob', 'gcs', 'bucket', 'minio', 'azure blob', 'file storage', 'aws', 'amazon', 'azure', 'gcp', 'amazon s3', 'azure storage', 'cloud storage', 'efs', 'ebs'] },
  { id: 'stream', name: 'Stream', aliases: ['kafka', 'kinesis', 'pulsar', 'event stream', 'pubsub', 'pub/sub', 'event log', 'redpanda', 'eventhub', 'aws', 'azure', 'event hubs', 'kinesis data streams', 'dataflow'] },
  { id: 'worker', name: 'Worker', aliases: ['job', 'consumer', 'batch', 'background', 'aws', 'azure', 'batch', 'sqs consumer', 'cloud run'] },
  { id: 'dns', name: 'DNS', aliases: ['domain name', 'route53', 'route 53', 'domain', 'nameserver', 'resolver', 'aws', 'azure', 'azure dns', 'cloud dns'] },
  { id: 'search', name: 'Search', aliases: ['elasticsearch', 'opensearch', 'solr', 'index', 'lucene', 'algolia', 'full text', 'aws', 'azure', 'cognitive search', 'cloudsearch'] },
  { id: 'function', name: 'Function', aliases: ['lambda', 'serverless', 'faas', 'cloud function', 'azure function', 'aws', 'amazon', 'azure', 'gcp', 'aws lambda', 'azure functions', 'cloud functions', 'edge function'] },
  { id: 'scheduler', name: 'Scheduler', aliases: ['cron', 'cron job', 'timer', 'clock', 'airflow', 'eventbridge', 'aws', 'azure', 'logic apps', 'step functions', 'cloud scheduler'] },
  { id: 'external', name: 'External service', aliases: ['third party', 'third-party', 'saas', 'third party api', 'cloud', 'stripe', 'twilio', 'vendor', 'aws', 'azure', 'gcp', 'google cloud'] },
  { id: 'monitoring', name: 'Monitoring', aliases: ['metrics', 'grafana', 'prometheus', 'alerting', 'logs', 'observability', 'datadog', 'cloudwatch', 'aws', 'azure', 'azure monitor', 'application insights', 'cloud monitoring'] },
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
