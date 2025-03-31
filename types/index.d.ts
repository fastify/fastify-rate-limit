/// <reference types='node' />

import {
  ContextConfigDefault,
  FastifyPluginCallback,
  FastifyRequest,
  FastifySchema,
  preHandlerAsyncHookHandler,
  RouteGenericInterface,
  RouteOptions
} from 'fastify'

declare module 'fastify' {
  interface FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> {
    createRateLimit(options?: fastifyRateLimit.CreateRateLimitOptions): (req: FastifyRequest) => Promise<
      | {
        isAllowed: true
        key: string
      }
      | {
        isAllowed: false
        key: string
        max: number
        timeWindow: number
        remaining: number
        ttl: number
        ttlInSeconds: number
        isExceeded: boolean
        isBanned: boolean
      }
    >

    rateLimit<
      RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
      ContextConfig = ContextConfigDefault,
      SchemaCompiler extends FastifySchema = FastifySchema
    >(options?: fastifyRateLimit.RateLimitOptions): preHandlerAsyncHookHandler<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      Logger
    >;
  }
  interface FastifyContextConfig {
    rateLimit?: fastifyRateLimit.RateLimitOptions | false;
  }
}

type FastifyRateLimit = FastifyPluginCallback<fastifyRateLimit.RateLimitPluginOptions>

declare namespace fastifyRateLimit {

  export interface FastifyRateLimitOptions { }

  export interface errorResponseBuilderContext {
    statusCode: number;
    ban: boolean;
    after: string;
    max: number;
    ttl: number;
  }

  export interface FastifyRateLimitStoreCtor {
    new(options: FastifyRateLimitOptions): FastifyRateLimitStore;
  }

  export interface FastifyRateLimitStore {
    incr(
      key: string,
      callback: (
        error: Error | null,
        result?: { current: number; ttl: number }
      ) => void
    ): void;
    child(
      routeOptions: RouteOptions & { path: string; prefix: string }
    ): FastifyRateLimitStore;
  }

  interface DefaultAddHeaders {
    'x-ratelimit-limit'?: boolean;
    'x-ratelimit-remaining'?: boolean;
    'x-ratelimit-reset'?: boolean;
    'retry-after'?: boolean;
  }

  interface DraftSpecAddHeaders {
    'ratelimit-limit'?: boolean;
    'ratelimit-remaining'?: boolean;
    'ratelimit-reset'?: boolean;
    'retry-after'?: boolean;
  }

  interface DefaultAddHeadersOnExceeding {
    'x-ratelimit-limit'?: boolean;
    'x-ratelimit-remaining'?: boolean;
    'x-ratelimit-reset'?: boolean;
  }

  interface DraftSpecAddHeadersOnExceeding {
    'ratelimit-limit'?: boolean;
    'ratelimit-remaining'?: boolean;
    'ratelimit-reset'?: boolean;
  }

  export interface CreateRateLimitOptions {
    store?: FastifyRateLimitStoreCtor;
    skipOnError?: boolean;
    max?:
      | number
      | ((req: FastifyRequest, key: string) => number)
      | ((req: FastifyRequest, key: string) => Promise<number>);
    timeWindow?:
      | number
      | string
      | ((req: FastifyRequest, key: string) => number)
      | ((req: FastifyRequest, key: string) => Promise<number>);
    /**
    * @deprecated Use `allowList` property
    */
    whitelist?: string[] | ((req: FastifyRequest, key: string) => boolean);
    allowList?: string[] | ((req: FastifyRequest, key: string) => boolean | Promise<boolean>);
    keyGenerator?: (req: FastifyRequest) => string | number | Promise<string | number>;
    ban?: number;
  }

  export type RateLimitHook =
    | 'onRequest'
    | 'preParsing'
    | 'preValidation'
    | 'preHandler'

  export interface RateLimitOptions extends CreateRateLimitOptions {
    hook?: RateLimitHook;
    cache?: number;
    continueExceeding?: boolean;
    onBanReach?: (req: FastifyRequest, key: string) => void;
    groupId?: string;
    errorResponseBuilder?: (
      req: FastifyRequest,
      context: errorResponseBuilderContext
    ) => object;
    enableDraftSpec?: boolean;
    onExceeding?: (req: FastifyRequest, key: string) => void;
    onExceeded?: (req: FastifyRequest, key: string) => void;
    exponentialBackoff?: boolean;

  }

  export interface RateLimitPluginOptions extends RateLimitOptions {
    global?: boolean;
    cache?: number;
    redis?: any;
    nameSpace?: string;
    addHeaders?: DefaultAddHeaders | DraftSpecAddHeaders;
    addHeadersOnExceeding?:
    | DefaultAddHeadersOnExceeding
    | DraftSpecAddHeadersOnExceeding;
  }
  export const fastifyRateLimit: FastifyRateLimit
  export { fastifyRateLimit as default }
}

declare function fastifyRateLimit (...params: Parameters<FastifyRateLimit>): ReturnType<FastifyRateLimit>
export = fastifyRateLimit
