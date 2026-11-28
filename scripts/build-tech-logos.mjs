// Generates src/techLogoData.ts from the Simple Icons package (devDependency, CC0-1.0). Run: node scripts/build-tech-logos.mjs
// Only the chosen slugs below are written, so the app imports a small static table and never the whole package or the network.
// Icons whose own artwork carries a non-permissive licence (CC-BY-*, NC, SA, custom trademark terms) are skipped and printed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = path.join(root, 'node_modules', 'simple-icons')
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
const index = JSON.parse(fs.readFileSync(path.join(pkgDir, 'data', 'simple-icons.json'), 'utf8'))
const bySlug = new Map(index.map((icon) => [icon.slug, icon]))
const PERMISSIVE = new Set(['CC0-1.0', 'Apache-2.0', 'MIT', 'BSD-3-Clause'])

/** slug -> extra search keywords (the brand title is always searchable too). */
const LOGOS = {
  // databases
  postgresql: 'postgres sql database rdbms relational',
  mysql: 'sql database rdbms relational',
  mariadb: 'maria sql database rdbms relational',
  mongodb: 'mongo nosql document database',
  redis: 'cache key value in-memory database',
  apachecassandra: 'cassandra nosql wide column database',
  apachecouchdb: 'couchdb couch nosql document database',
  apachehbase: 'hbase hadoop wide column database',
  elasticsearch: 'elastic search lucene index full text',
  sqlite: 'sql embedded database file',
  neo4j: 'graph database cypher',
  couchbase: 'nosql document database cache',
  influxdb: 'influx time series metrics database',
  clickhouse: 'olap columnar analytics database',
  cockroachlabs: 'cockroach cockroachdb distributed sql database',
  supabase: 'postgres backend baas database auth',
  firebase: 'google backend baas realtime database auth firestore',
  snowflake: 'data warehouse analytics sql',
  duckdb: 'duck olap embedded analytics',
  planetscale: 'vitess mysql serverless database',
  meilisearch: 'meili search engine full text',
  algolia: 'search engine hosted full text',
  minio: 'object storage s3 compatible bucket',
  // messaging, streaming, realtime
  apachekafka: 'kafka event stream streaming broker log pubsub',
  rabbitmq: 'rabbit amqp message queue broker',
  apachepulsar: 'pulsar event stream streaming broker pubsub',
  mqtt: 'iot message broker pubsub',
  natsdotio: 'nats message queue broker pubsub',
  socketdotio: 'socket io websocket realtime',
  webrtc: 'video call peer to peer realtime',
  // infrastructure
  docker: 'container image compose',
  kubernetes: 'k8s container orchestration cluster pod',
  nginx: 'web server reverse proxy load balancer',
  cloudflare: 'cdn dns edge ddos',
  vercel: 'hosting deploy frontend serverless edge',
  netlify: 'hosting deploy frontend jamstack',
  terraform: 'iac infrastructure as code hashicorp',
  ansible: 'configuration management automation red hat',
  helm: 'kubernetes chart package',
  istio: 'service mesh kubernetes sidecar',
  envoyproxy: 'envoy proxy service mesh sidecar',
  traefikproxy: 'traefik reverse proxy ingress load balancer',
  haproxy: 'ha proxy load balancer reverse proxy',
  linux: 'os operating system tux',
  ubuntu: 'linux os operating system canonical',
  redhat: 'red hat linux rhel',
  vault: 'hashicorp secrets',
  consul: 'hashicorp service discovery',
  nomad: 'hashicorp scheduler orchestration',
  packer: 'hashicorp image build',
  pulumi: 'iac infrastructure as code',
  podman: 'container docker alternative',
  containerd: 'container runtime',
  rancher: 'kubernetes management',
  linkerd: 'service mesh kubernetes',
  cilium: 'ebpf networking kubernetes cni',
  etcd: 'key value store consensus kubernetes',
  kong: 'api gateway',
  apachetomcat: 'tomcat java servlet web server',
  wireguard: 'vpn tunnel',
  openvpn: 'vpn tunnel',
  argo: 'argocd gitops workflows kubernetes',
  // data and ml
  apachespark: 'spark big data batch processing',
  apacheairflow: 'airflow workflow scheduler orchestration dag',
  apacheflink: 'flink stream processing big data',
  apachehadoop: 'hadoop hdfs mapreduce big data',
  apachehive: 'hive hadoop sql warehouse',
  apachedruid: 'druid olap analytics',
  apachenifi: 'nifi dataflow ingestion',
  databricks: 'spark lakehouse data',
  trino: 'presto sql query engine',
  prefect: 'workflow orchestration data pipeline',
  tensorflow: 'ml machine learning ai',
  pytorch: 'ml machine learning ai',
  huggingface: 'ml machine learning ai models',
  // observability
  grafana: 'dashboard metrics monitoring',
  prometheus: 'metrics monitoring alerting scrape',
  datadog: 'monitoring apm observability',
  sentry: 'error tracking monitoring crash',
  jaeger: 'tracing distributed observability',
  kibana: 'elastic dashboard logs',
  logstash: 'elastic logs pipeline',
  elastic: 'elk stack search',
  fluentd: 'logs collector',
  splunk: 'logs monitoring siem',
  newrelic: 'new relic monitoring apm observability',
  pagerduty: 'pager duty on call alerting incident',
  dynatrace: 'monitoring apm observability',
  thanos: 'prometheus long term metrics',
  // languages, frameworks
  nodedotjs: 'node js nodejs javascript runtime',
  python: 'language',
  go: 'golang language',
  openjdk: 'java jvm jdk language',
  spring: 'java framework boot',
  react: 'reactjs frontend ui library',
  nextdotjs: 'next js nextjs react framework ssr',
  graphql: 'api query language',
  typescript: 'ts language',
  javascript: 'js language',
  kotlin: 'language jvm android',
  dotnet: 'dot net csharp c# microsoft framework',
  swift: 'language ios apple',
  flutter: 'dart mobile framework',
  django: 'python framework web',
  flask: 'python framework web',
  fastapi: 'fast api python framework web',
  express: 'expressjs node framework web',
  nestjs: 'nest node framework web',
  redux: 'state management frontend',
  prisma: 'orm database typescript',
  deno: 'javascript runtime',
  // services and tooling
  stripe: 'payments payment gateway billing',
  googlepay: 'gpay google pay payments wallet',
  paypal: 'payments payment gateway wallet',
  auth0: 'authentication identity oauth login',
  okta: 'authentication identity sso login',
  github: 'git repository source code',
  gitlab: 'git repository source code ci',
  githubactions: 'github actions ci cd pipeline workflow',
  circleci: 'ci cd pipeline',
  bitbucket: 'git repository atlassian',
  jira: 'tickets issues atlassian',
  postman: 'api testing',
  swagger: 'openapi api documentation',
  snyk: 'security vulnerability scanning',
  discord: 'chat messaging bot',
  telegram: 'chat messaging bot',
  whatsapp: 'chat messaging',
  mailchimp: 'email marketing',
  // cloud and edge
  googlecloud: 'gcp google cloud platform',
  digitalocean: 'digital ocean droplet cloud hosting',
  akamai: 'cdn edge',
  fastly: 'cdn edge',
  hasura: 'graphql engine',
}

const header = `// GENERATED by scripts/build-tech-logos.mjs from simple-icons@${pkg.version} (CC0-1.0). Do not edit by hand.
// Brand names and logos belong to their owners. A few icons carry their own permissive licence, kept in \`license\`: Apache-2.0 / MIT / BSD-3-Clause artwork stays under that licence; its notice is simple-icons' LICENSE.md and the upstream project.
`
const missing = []
const skipped = []
const entries = []
for (const [slug, words] of Object.entries(LOGOS)) {
  const icon = bySlug.get(slug)
  const svgFile = path.join(pkgDir, 'icons', `${slug}.svg`)
  if (!icon || !fs.existsSync(svgFile)) { missing.push(slug); continue }
  const license = icon.license?.type
  if (license && !PERMISSIVE.has(license)) { skipped.push(`${slug} (${license})`); continue }
  const svg = fs.readFileSync(svgFile, 'utf8')
  const paths = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)]
  if (paths.length !== 1 || !/viewBox="0 0 24 24"/.test(svg)) { missing.push(`${slug} (unexpected svg)`); continue }
  const keywords = [...new Set(`${words} ${icon.title}`.toLowerCase().split(/\s+/).filter(Boolean))].join(' ')
  entries.push({ slug, title: icon.title, hex: `#${icon.hex.toLowerCase()}`, path: paths[0][1], keywords, ...(license && license !== 'CC0-1.0' ? { license } : {}) })
}
entries.sort((a, b) => a.title.localeCompare(b.title, 'en'))

const body = `import type { TechLogo } from './techLogoSearch'

export const TECH_LOGOS: readonly TechLogo[] = [
${entries.map((e) => `  ${JSON.stringify(e)},`).join('\n')}
]
`
fs.writeFileSync(path.join(root, 'src', 'techLogoData.ts'), header + body)
console.log(`simple-icons@${pkg.version}: wrote ${entries.length} logos`)
if (missing.length) console.log(`Missing from this version (skipped): ${missing.join(', ')}`)
if (skipped.length) console.log(`Skipped, not CC0/permissive artwork: ${skipped.join(', ')}`)
