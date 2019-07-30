import * as http from "http";
import * as fastify from "fastify";

declare namespace fastifyRateLimit {
  interface FastifyRateLimitOptions {
    global?: boolean;
    max?: number;
    timeWindow?: number;
    cache?: number;
    whitelist?: string[];
    redis?: any;
    skipOnError?: boolean;
    keyGenerator?: (
      req: fastify.FastifyRequest<http.IncomingMessage>
    ) => string | number;
    errorMessage?: string | (() => string);
  }
}

declare let fastifyRateLimit: fastify.Plugin<
  http.Server,
  http.IncomingMessage,
  http.ServerResponse,
  fastifyRateLimit.FastifyRateLimitOptions
>;

export = fastifyRateLimit;
