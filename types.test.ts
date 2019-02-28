import * as fastify from 'fastify';
import * as fastifyRateLimit from '../fastify-rate-limit';
import * as redis from 'redis';

const app = fastify();

app.register(fastifyRateLimit, {
  max: 3, 
  timeWindow: 5000, 
  cache: 10000, 
  whitelist: ['127.0.0.1'], 
  redis: new redis.RedisClient({ host: '127.0.0.1' }), 
  skipOnError: true, 
  keyGenerator: (req: fastify.FastifyRequest<any>) => req.raw.ip
});