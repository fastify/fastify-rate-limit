import * as http from 'http';
import * as fastify from 'fastify';

declare namespace fastifyRateLimit {
  interface FastifyRateLimitStoreCtor {
    new (options: FastifyRateLimitOptions): FastifyRateLimitStore;
  }
  
  interface FastifyRateLimitStore {
    incr(key: string, callback: ( error: Error|null, result?: { current: number, ttl: number } ) => void): void;
    child(routeOptions: fastify.RouteOptions<http.Server, http.IncomingMessage, http.ServerResponse> & { path: string, prefix: string }): FastifyRateLimitStore;
  }
  
  interface FastifyRateLimitOptions {
    global?: boolean;
    max?: number | ((req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => number);
    timeWindow?: number;
    cache?: number;
    store?: FastifyRateLimitStoreCtor;
    whitelist?: string[] | ((req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => boolean);
    redis?: any;
    skipOnError?: boolean;
    keyGenerator?: (req: fastify.FastifyRequest<http.IncomingMessage>) => string | number;
    errorResponseBuilder?: (req: fastify.FastifyRequest<http.IncomingMessage>, context: errorResponseBuilderContext) => object;
  }

  interface errorResponseBuilderContext {
    after: string;
    max: number;
  }
}

declare let fastifyRateLimit: fastify.Plugin<
  http.Server,
  http.IncomingMessage,
  http.ServerResponse,
  fastifyRateLimit.FastifyRateLimitOptions
>;

export = fastifyRateLimit;
