import fastify from 'fastify'
import fastifyRateLimit from '../index.js'

const server = fastify()

await server.register(fastifyRateLimit, {
  global: true,
  max: 10000,
  timeWindow: '1 minute'
})

server.get('/', (_request, reply) => {
  reply.send('Hello, world!')
})

const start = async () => {
  try {
    await server.listen({ port: 3000 })
    console.log('Server is running on port 3000')
  } catch (error) {
    console.error('Error starting server:', error)
  }
}

start()
