import * as http from 'http'
import * as http2 from 'http2'
import * as fastify from 'fastify';
import * as fastifyRateLimit from '../../../fastify-rate-limit';
import * as ioredis from 'ioredis';

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
  errorResponseBuilder: (req: fastify.FastifyRequest<http.IncomingMessage>, context: fastifyRateLimit.errorResponseBuilderContext) => ({ code: 429, timeWindow: context.after, limit: context.max })
}

const options2 = {
  global: true,
  max: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (42),
  whitelist: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (false),
  timeWindow: 5000
}

appWithImplicitHttp.register(fastifyRateLimit, options1)
appWithImplicitHttp.register(fastifyRateLimit, options2)

const appWithHttp2: fastify.FastifyInstance<
  http2.Http2Server,
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
> = fastify({ http2: true })

appWithHttp2.register(fastifyRateLimit, options1)
appWithHttp2.register(fastifyRateLimit, options2)
