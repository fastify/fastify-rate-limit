import * as http from 'http';
import * as fastify from 'fastify';

declare namespace fastifyRateLimit {
  interface FastifyRateLimitOptions {
    global?: boolean;
    max?: number | ((req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => number);
    timeWindow?: number;
    cache?: number;
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
