/// <reference types='node' />

import {
  FastifyPluginCallback,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RouteOptions
} from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    rateLimit: (options?: fastifyRateLimit.RateLimitOptions) => preHandlerAsyncHookHandler;
  }
  interface FastifyContextConfig {
    rateLimit?: fastifyRateLimit.RateLimitOptions | false;
  }
}

type FastifyRateLimit = FastifyPluginCallback<fastifyRateLimit.RateLimitPluginOptions>;

declare namespace fastifyRateLimit {

  export interface FastifyRateLimitOptions { }

  export interface errorResponseBuilderContext {
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

  export type RateLimitHook =
    | 'onRequest'
    | 'preParsing'
    | 'preValidation'
    | 'preHandler'

  export interface RateLimitOptions {
    max?:
    | number
    | ((req: FastifyRequest, key: string) => number)
    | ((req: FastifyRequest, key: string) => Promise<number>);
    timeWindow?: number | string;
    hook?: RateLimitHook;
    cache?: number;
    store?: FastifyRateLimitStoreCtor;
    /**
     * @deprecated Use `allowList` property
     */
    whitelist?: string[] | ((req: FastifyRequest, key: string) => boolean);
    allowList?: string[] | ((req: FastifyRequest, key: string) => boolean | Promise<boolean>);
    continueExceeding?: boolean;
    skipOnError?: boolean;
    ban?: number;
    onBanReach?: (req: FastifyRequest, key: string) => void;
    keyGenerator?: (req: FastifyRequest) => string | number | Promise<string | number>;
    errorResponseBuilder?: (
      req: FastifyRequest,
      context: errorResponseBuilderContext
    ) => object;
    enableDraftSpec?: boolean;
    onExceeding?: (req: FastifyRequest, key: string) => void;
    onExceeded?: (req: FastifyRequest, key: string) => void;
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

declare function fastifyRateLimit(...params: Parameters<FastifyRateLimit>): ReturnType<FastifyRateLimit>
export = fastifyRateLimit
