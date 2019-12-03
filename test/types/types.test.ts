import * as http from 'http'
import * as http2 from 'http2'
import * as fastify from 'fastify';
import * as types from '../../index';
import * as fastifyRateLimit from '../../../fastify-rate-limit';
import * as ioredis from 'ioredis';

class CustomStore implements types.FastifyRateLimitStore {
  constructor(options: types.FastifyRateLimitOptions) {}
  incr(key: string, callback: ( error: Error|null, result?: { current: number, ttl: number } ) => void) {}
  child(routeOptions: fastify.RouteOptions<http.Server, http.IncomingMessage, http.ServerResponse> & { path: string, prefix: string }) {
    return <CustomStore>(<types.FastifyRateLimitOptions>{})
  }
}

const appWithImplicitHttp = fastify()
const options1 = {
  global: true,
  max: 3,
  timeWindow: 5000,
  cache: 10000,
  whitelist: ['127.0.0.1'],
  redis: new ioredis({ host: '127.0.0.1' }),
  skipOnError: true,
  ban: 10,
  keyGenerator: (req: fastify.FastifyRequest<http.IncomingMessage>) => req.ip,
  errorResponseBuilder: (req: fastify.FastifyRequest<http.IncomingMessage>, context: fastifyRateLimit.errorResponseBuilderContext) => ({ code: 429, timeWindow: context.after, limit: context.max }),
  addHeaders: {
    'x-ratelimit-limit': false,
    'x-ratelimit-remaining': false,
    'x-ratelimit-reset': false,
    'retry-after': false
  }
}

const options2 = {
  global: true,
  max: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (42),
  whitelist: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (false),
  timeWindow: 5000
}

const options3 = {
  global: true,
  max: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (42),
  timeWindow: 5000,
  store: CustomStore
}

appWithImplicitHttp.register(fastifyRateLimit, options1)
appWithImplicitHttp.register(fastifyRateLimit, options2)
appWithImplicitHttp.register(fastifyRateLimit, options3)

const appWithHttp2: fastify.FastifyInstance<
  http2.Http2Server,
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
> = fastify({ http2: true })

appWithHttp2.register(fastifyRateLimit, options1)
appWithHttp2.register(fastifyRateLimit, options2)
appWithHttp2.register(fastifyRateLimit, options3)
