import * as http from 'http'
import * as fastify from 'fastify';
import * as fastifyRateLimit from '../../../fastify-rate-limit';
import * as ioredis from 'ioredis';

const app = fastify();

app.register(fastifyRateLimit, {
  global: true,
  max: 3,
  timeWindow: 5000,
  cache: 10000,
  whitelist: ['127.0.0.1'],
  redis: new ioredis({ host: '127.0.0.1' }),
  skipOnError: true,
  ban: 10,
  keyGenerator: (req: fastify.FastifyRequest<http.IncomingMessage>) => req.ip,
  errorResponseBuilder: (req: fastify.FastifyRequest<http.IncomingMessage>, context) => ({ code: 429, timeWindow: context.after, limit: context.max }),
  displayHeaders: {
    'x-ratelimit-limit': false,
    'x-ratelimit-remaining': false,
    'x-ratelimit-reset': false,
    'retry-after': false
  }
});

app.register(fastifyRateLimit, {
  global: true,
  max: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (42),
  whitelist: (req: fastify.FastifyRequest<http.IncomingMessage>, key: string) => (false),
  timeWindow: 5000
});
