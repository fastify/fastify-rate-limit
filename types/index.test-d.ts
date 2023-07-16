import fastify, {
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RequestGenericInterface,
  RouteOptions
} from 'fastify'
import * as http2 from 'http2'
import { default as ioredis } from 'ioredis'
import fastifyRateLimit, {
  errorResponseBuilderContext,
  FastifyRateLimitOptions,
  FastifyRateLimitStore,
  RateLimitPluginOptions
} from '..'

class CustomStore implements FastifyRateLimitStore {
  constructor(options: FastifyRateLimitOptions) {}
  incr(
    key: string,
    callback: (
      error: Error | null,
      result?: { current: number; ttl: number }
    ) => void
  ) {}
  child(routeOptions: RouteOptions & { path: string; prefix: string }) {
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
  continueExceeding: false,
  keyGenerator: (req: FastifyRequest<RequestGenericInterface>) => req.ip,
  errorResponseBuilder: (
    req: FastifyRequest<RequestGenericInterface>,
    context: errorResponseBuilderContext
  ) => {
    if (context.ban) {
      return {
        statusCode: 403,
        error: "Forbidden",
        message: `You can not access this service as you have sent too many requests that exceed your rate limit. Your IP: ${req.ip} and Limit: ${context.max}`,
      }
    } else {
      return {
        statusCode: 429,
        error: "Too Many Requests",
        message: `You hit the rate limit, please slow down! You can retry in ${context.after}`,
      }
    }
  },
  addHeadersOnExceeding: {
    'x-ratelimit-limit': false,
    'x-ratelimit-remaining': false,
    'x-ratelimit-reset': false
  },
  addHeaders: {
    'x-ratelimit-limit': false,
    'x-ratelimit-remaining': false,
    'x-ratelimit-reset': false,
    'retry-after': false
  },
  onExceeding: (req: FastifyRequest<RequestGenericInterface>, key: string) => ({}),
  onExceeded: (req: FastifyRequest<RequestGenericInterface>, key: string) => ({}),
  onBanReach: (req: FastifyRequest<RequestGenericInterface>, key: string) => ({})
}
const options2: RateLimitPluginOptions = {
  global: true,
  max: (req: FastifyRequest<RequestGenericInterface>, key: string) => 42,
  allowList: (req: FastifyRequest<RequestGenericInterface>, key: string) => false,
  timeWindow: 5000,
  hook: 'preParsing'
}

const options3: RateLimitPluginOptions = {
  global: true,
  max: (req: FastifyRequest<RequestGenericInterface>, key: string) => 42,
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preValidation'
}

const options4: RateLimitPluginOptions = {
  global: true,
  max: (req: FastifyRequest<RequestGenericInterface>, key: string) => Promise.resolve(42),
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preHandler'
}

const options5: RateLimitPluginOptions = {
  max: 3,
  timeWindow: 5000,
  cache: 10000,
  redis: new ioredis({ host: '127.0.0.1' }),
  nameSpace: 'my-namespace'
}

const options6: RateLimitPluginOptions = {
  global: true,
  allowList: async (req, key) => true,
  keyGenerator: async (req) => '',
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preHandler'
}

appWithImplicitHttp.register(fastifyRateLimit, options1)
appWithImplicitHttp.register(fastifyRateLimit, options2)
appWithImplicitHttp.register(fastifyRateLimit, options5)

appWithImplicitHttp.register(fastifyRateLimit, options3).then(() => {
  const preHandler1: preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit()
  const preHandler2: preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options1)
  const preHandler3: preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options2)
  const preHandler4: preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options3)
  const preHandler5: preHandlerAsyncHookHandler = appWithImplicitHttp.rateLimit(options4)
  // The following test is dependent on https://github.com/fastify/fastify/pull/2929
  // appWithImplicitHttp.setNotFoundHandler({
  //   preHandler: appWithImplicitHttp.rateLimit()
  // }, function (request:FastifyRequest<RequestGenericInterface>, reply: FastifyReply<ReplyGenericInterface>) {
  //   reply.status(404).send(new Error('Not found'))
  // })
})

appWithImplicitHttp.get('/', { config: { rateLimit: { max: 10, timeWindow: "60s" } } }, () => { return "limited" })

const appWithHttp2: FastifyInstance<
  http2.Http2Server,
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
> = fastify({ http2: true })

appWithHttp2.register(fastifyRateLimit, options1)
appWithHttp2.register(fastifyRateLimit, options2)
appWithHttp2.register(fastifyRateLimit, options3)
appWithHttp2.register(fastifyRateLimit, options5)

appWithHttp2.get('/public', {
  config: {
    rateLimit: false
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... public' })
})
