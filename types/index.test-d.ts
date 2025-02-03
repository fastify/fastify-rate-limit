import fastify, {
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RequestGenericInterface,
  RouteOptions
} from 'fastify'
import * as http2 from 'node:http2'
import IORedis from 'ioredis'
import pino from 'pino'
import fastifyRateLimit, {
  CreateRateLimitOptions,
  errorResponseBuilderContext,
  FastifyRateLimitOptions,
  FastifyRateLimitStore,
  RateLimitPluginOptions
} from '..'
import { expectAssignable, expectType } from 'tsd'

class CustomStore implements FastifyRateLimitStore {
  options: FastifyRateLimitOptions

  constructor (options: FastifyRateLimitOptions) {
    this.options = options
  }

  incr (
    _key: string,
    _callback: (
      error: Error | null,
      result?: { current: number; ttl: number }
    ) => void
  ) {}

  child (_routeOptions: RouteOptions & { path: string; prefix: string }) {
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
  redis: new IORedis({ host: '127.0.0.1' }),
  skipOnError: true,
  ban: 10,
  continueExceeding: false,
  keyGenerator: (req: FastifyRequest<RequestGenericInterface>) => req.ip,
  groupId: '42',
  errorResponseBuilder: (
    req: FastifyRequest<RequestGenericInterface>,
    context: errorResponseBuilderContext
  ) => {
    if (context.ban) {
      return {
        statusCode: 403,
        error: 'Forbidden',
        message: `You can not access this service as you have sent too many requests that exceed your rate limit. Your IP: ${req.ip} and Limit: ${context.max}`,
      }
    } else {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
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
  onExceeding: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => ({}),
  onExceeded: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => ({}),
  onBanReach: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => ({})
}
const options2: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 42,
  allowList: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => false,
  timeWindow: 5000,
  hook: 'preParsing'
}

const options3: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 42,
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preValidation'
}

const options4: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => Promise.resolve(42),
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preHandler'
}

const options5: RateLimitPluginOptions = {
  max: 3,
  timeWindow: 5000,
  cache: 10000,
  redis: new IORedis({ host: '127.0.0.1' }),
  nameSpace: 'my-namespace'
}

const options6: RateLimitPluginOptions = {
  global: true,
  allowList: async (_req, _key) => true,
  keyGenerator: async (_req) => '',
  timeWindow: 5000,
  store: CustomStore,
  hook: 'preHandler'
}

const options7: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 42,
  timeWindow: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 5000,
  store: CustomStore,
  hook: 'preValidation'
}

const options8: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 42,
  timeWindow: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => Promise.resolve(5000),
  store: CustomStore,
  hook: 'preValidation'
}

const options9: RateLimitPluginOptions = {
  global: true,
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => Promise.resolve(42),
  timeWindow: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 5000,
  store: CustomStore,
  hook: 'preValidation',
  exponentialBackoff: true
}

appWithImplicitHttp.register(fastifyRateLimit, options1)
appWithImplicitHttp.register(fastifyRateLimit, options2)
appWithImplicitHttp.register(fastifyRateLimit, options5)
appWithImplicitHttp.register(fastifyRateLimit, options9)

appWithImplicitHttp.register(fastifyRateLimit, options3).then(() => {
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit())
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options1))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options2))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options3))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options4))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options5))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options6))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options7))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options8))
  expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options9))
  // The following test is dependent on https://github.com/fastify/fastify/pull/2929
  // appWithImplicitHttp.setNotFoundHandler({
  //   preHandler: appWithImplicitHttp.rateLimit()
  // }, function (request:FastifyRequest<RequestGenericInterface>, reply: FastifyReply<ReplyGenericInterface>) {
  //   reply.status(404).send(new Error('Not found'))
  // })
})

appWithImplicitHttp.get('/', { config: { rateLimit: { max: 10, timeWindow: '60s' } } }, () => { return 'limited' })

const appWithHttp2: FastifyInstance<
  http2.Http2Server,
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
> = fastify({ http2: true })

appWithHttp2.register(fastifyRateLimit, options1)
appWithHttp2.register(fastifyRateLimit, options2)
appWithHttp2.register(fastifyRateLimit, options3)
appWithHttp2.register(fastifyRateLimit, options5)
appWithHttp2.register(fastifyRateLimit, options6)
appWithHttp2.register(fastifyRateLimit, options7)
appWithHttp2.register(fastifyRateLimit, options8)
appWithHttp2.register(fastifyRateLimit, options9)

appWithHttp2.get('/public', {
  config: {
    rateLimit: false
  }
}, (_request, reply) => {
  reply.send({ hello: 'from ... public' })
})

expectAssignable<errorResponseBuilderContext>({
  statusCode: 429,
  ban: true,
  after: '123',
  max: 1000,
  ttl: 123
})

const appWithCustomLogger = fastify({
  loggerInstance: pino(),
}).withTypeProvider()

appWithCustomLogger.register(fastifyRateLimit, options1)

appWithCustomLogger.route({
  method: 'GET',
  url: '/',
  preHandler: appWithCustomLogger.rateLimit({}),
  handler: () => {},
})

const options10: CreateRateLimitOptions = {
  store: CustomStore,
  skipOnError: true,
  max: 0,
  timeWindow: 5000,
  allowList: ['127.0.0.1'],
  keyGenerator: (req: FastifyRequest<RequestGenericInterface>) => req.ip,
  ban: 10
}

appWithImplicitHttp.register(fastifyRateLimit, { global: false })
const checkRateLimit = appWithImplicitHttp.createRateLimit(options10)
appWithImplicitHttp.route({
  method: 'GET',
  url: '/',
  handler: async (req, _reply) => {
    const limit = await checkRateLimit(req)
    expectType<{
      isAllowed: true;
      key: string;
    } | {
      isAllowed: false;
      key: string;
      max: number;
      timeWindow: number;
      remaining: number;
      ttl: number;
      ttlInSeconds: number;
      isExceeded: boolean;
      isBanned: boolean;
    }>(limit)
  },
})

const options11: CreateRateLimitOptions = {
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 42,
  timeWindow: '10s',
  allowList: (_req: FastifyRequest<RequestGenericInterface>) => true,
  keyGenerator: (_req: FastifyRequest<RequestGenericInterface>) => 42,
}

const options12: CreateRateLimitOptions = {
  max: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => Promise.resolve(42),
  timeWindow: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => 5000,
  allowList: (_req: FastifyRequest<RequestGenericInterface>) => Promise.resolve(true),
  keyGenerator: (_req: FastifyRequest<RequestGenericInterface>) => Promise.resolve(42),
}

const options13: CreateRateLimitOptions = {
  timeWindow: (_req: FastifyRequest<RequestGenericInterface>, _key: string) => Promise.resolve(5000),
  keyGenerator: (_req: FastifyRequest<RequestGenericInterface>) => Promise.resolve('key'),
}

expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options11))
expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options12))
expectType<preHandlerAsyncHookHandler>(appWithImplicitHttp.rateLimit(options13))
