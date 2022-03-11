/// <reference types='node' />

import {
  FastifyPluginCallback,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RequestGenericInterface,
  RouteOptions
} from 'fastify';

declare module 'fastify' {
  interface FastifyRequestInterface<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RequestGeneric extends RequestGenericInterface = RequestGenericInterface
  > {
    ip: string | number;
  }
  interface FastifyInstance {
    rateLimit: (options?: RateLimitOptions) => preHandlerAsyncHookHandler;
  }
}

export interface FastifyRateLimitOptions {}

export interface errorResponseBuilderContext {
  after: string;
  max: number;
  ttl: number;
}

export interface FastifyRateLimitStoreCtor {
  new (options: FastifyRateLimitOptions): FastifyRateLimitStore;
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
  allowList?: string[] | ((req: FastifyRequest, key: string) => boolean);
  continueExceeding?: boolean;
  skipOnError?: boolean;
  ban?: number;
  keyGenerator?: (req: FastifyRequest) => string | number;
  errorResponseBuilder?: (
    req: FastifyRequest,
    context: errorResponseBuilderContext
  ) => object;
  enableDraftSpec?: boolean;
}

export interface RateLimitPluginOptions extends RateLimitOptions {
  global?: boolean;
  cache?: number;
  redis?: any;
  addHeaders?: DefaultAddHeaders | DraftSpecAddHeaders;
  addHeadersOnExceeding?:
    | DefaultAddHeadersOnExceeding
    | DraftSpecAddHeadersOnExceeding;
}

declare const fastifyRateLimit: FastifyPluginCallback<RateLimitPluginOptions>;
export default fastifyRateLimit;
