import Fastify from 'fastify'
import fastifyRateLimit from '../index.js'
import fastifyValkey from '@fastify/valkey-glide'

const fastify = Fastify()

await fastify.register(fastifyValkey, {
  namespace: 'rateLimit',
  addresses: [{ host: '127.0.0.1', port: 6379 }],
  // clientMode: 'cluster'
})

await fastify.register(fastifyRateLimit, {
  global: false,
  max: 100,
  timeWindow: '1 minute',
  valkey: fastify.valkey.rateLimit,
  nameSpace: 'fastify-rate-limit:'
})

fastify.get('/', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, async () => {
  return { hello: '@fastify/valkey-glide' }
})

await fastify.listen({ port: 3000 })
console.log('Server listening at http://localhost:3000')
