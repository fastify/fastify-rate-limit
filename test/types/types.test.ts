import * as http2 from 'http2'
import fastify, { RouteOptions, FastifyRequest, FastifyInstance, RequestGenericInterface, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';
import * as ioredis from 'ioredis';
import fastifyRateLimit, { FastifyRateLimitStore, FastifyRateLimitOptions, errorResponseBuilderContext, RateLimitPluginOptions } from '../../';

class CustomStore implements FastifyRateLimitStore {
  constructor(options: FastifyRateLimitOptions) {}
  incr(key: string, callback: ( error: Error|null, result?: { current: number, ttl: number } ) => void) {}
  child(routeOptions: RouteOptions & { path: string, prefix: string }) {
    return <CustomStore>(<FastifyRateLimitOptions>{})
  }
}

const appWithImplicitHttp = fastify()
const options1: RateLimitPluginOptions = {
  global: true,
  max: 3,
  timeWindow: 5000,
  cache: 10000,
  allowList: ['127.0.0.1'],
  redis: new ioredis({ host: '127.0.0.1' }),
  skipOnError: true,
  ban: 10,
  keyGenerator: (req: FastifyRequest<RequestGenericInterface>) => req.ip,
  errorResponseBuilder: (req: FastifyRequest<RequestGenericInterface>, context: errorResponseBuilderContext) => ({ code: 429, timeWindow: context.after, limit: context.max }),
  addHeaders: {
    'x-ratelimit-limit': false,
    'x-ratelimit-remaining': false,
    'x-ratelimit-reset': false,
    'retry-after': false
  }
}

const options2 = {
  global: true,
  max: (req: FastifyRequest<RequestGenericInterface>, key: string) => (42),
  allowList: (req: FastifyRequest<RequestGenericInterface>, key: string) => (false),
  timeWindow: 5000
}

const options3 = {
  global: true,
  max: (req: FastifyRequest<RequestGenericInterface>, key: string) => (42),
  timeWindow: 5000,
  store: CustomStore
}

appWithImplicitHttp.register(fastifyRateLimit, options1)
appWithImplicitHttp.register(fastifyRateLimit, options2)

appWithImplicitHttp.register(fastifyRateLimit, options3).then(() => {
  const preHandler1:preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit()
  const preHandler2:preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options1)
  const preHandler3:preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options2)
  const preHandler4:preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options3)
  // The following test is dependent on https://github.com/fastify/fastify/pull/2929
  // appWithImplicitHttp.setNotFoundHandler({
  //   preHandler: appWithImplicitHttp.rateLimit()
  // }, function (request:FastifyRequest<RequestGenericInterface>, reply: FastifyReply<ReplyGenericInterface>) {
  //   reply.status(404).send(new Error('Not found'))
  // })
})


const appWithHttp2: FastifyInstance<
  http2.Http2Server,
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
> = fastify({ http2: true })

appWithHttp2.register(fastifyRateLimit, options1)
appWithHttp2.register(fastifyRateLimit, options2)
appWithHttp2.register(fastifyRateLimit, options3)
