import * as http from 'http';
import * as fastify from 'fastify';
import * as ioredis from 'ioredis';

declare namespace fastifyRateLimit {
  interface FastifyRateLimitOptions {
    max?: number;
    timeWindow?: number;
    cache?: number;
    whitelist?: string[];
    redis?: ioredis.Redis;
    skipOnError?: boolean;
    keyGenerator?: (req: fastify.FastifyRequest<any>) => string | number;
  }
}

declare let fastifyRateLimit: fastify.Plugin<
  http.Server,
  http.IncomingMessage,
  http.ServerResponse,
  fastifyRateLimit.FastifyRateLimitOptions
>;

export = fastifyRateLimit;