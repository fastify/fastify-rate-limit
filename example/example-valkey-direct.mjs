import Fastify from 'fastify'
import fastifyRateLimit from '../index.js'
import { GlideClient } from '@valkey/valkey-glide'

const fastify = Fastify()

const valkey = await GlideClient.createClient({
  addresses: [{ host: '127.0.0.1', port: 6379 }]
})

fastify.addHook('onClose', async () => {
  valkey.close()
})

await fastify.register(fastifyRateLimit, {
  global: false,
  max: 100,
  timeWindow: '1 minute',
  valkey,
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
  return { hello: 'valkey direct client' }
})

await fastify.listen({ port: 3000 })
console.log('Server listening at http://localhost:3000')
