/// <reference types="node" />

import * as fastify from 'fastify';
import * as https from "https";
import { Server, IncomingMessage, ServerResponse } from "http";
import { Http2SecureServer, Http2Server, Http2ServerRequest, Http2ServerResponse } from "http2";

type HttpServer = Server | Http2Server | Http2SecureServer | https.Server;
type HttpRequest = IncomingMessage | Http2ServerRequest;
type HttpResponse = ServerResponse | Http2ServerResponse;

declare module "fastify" {
  interface FastifyReply<HttpResponse> {}
}

declare function fastifyRateLimit(): fastify.Plugin<
  Server,
  IncomingMessage,
  ServerResponse,
  {
    global?: boolean;
    max?: number | ((req: fastify.FastifyRequest<IncomingMessage>, key: string) => number);
    timeWindow?: number;
    cache?: number;
    store?: fastifyRateLimit.FastifyRateLimitStoreCtor;
    whitelist?: string[] | ((req: fastify.FastifyRequest<IncomingMessage>, key: string) => boolean);
    redis?: any;
    skipOnError?: boolean;
    ban?: number;
    keyGenerator?: (req: fastify.FastifyRequest<IncomingMessage>) => string | number;
    errorResponseBuilder?: (req: fastify.FastifyRequest<IncomingMessage>, context: fastifyRateLimit.errorResponseBuilderContext) => object;
    addHeaders?: fastifyRateLimit.AddHeaders;
  }
>;

declare namespace fastifyRateLimit {
  interface FastifyRateLimitOptions {}

  interface errorResponseBuilderContext {
    after: string;
    max: number;
  }

  interface FastifyRateLimitStoreCtor {
    new (options: FastifyRateLimitOptions): FastifyRateLimitStore;
  }

  interface FastifyRateLimitStore {
    incr(key: string, callback: ( error: Error|null, result?: { current: number, ttl: number } ) => void): void;
    child(routeOptions: fastify.RouteOptions<Server, IncomingMessage, ServerResponse> & { path: string, prefix: string }): FastifyRateLimitStore;
  }

  interface AddHeaders {
    'x-ratelimit-limit'?: boolean,
    'x-ratelimit-remaining'?: boolean,
    'x-ratelimit-reset'?: boolean,
    'retry-after'?: boolean
  }
}

export = fastifyRateLimit;
