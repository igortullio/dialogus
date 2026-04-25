import { pino, stdSerializers } from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  name: '@dialogus/db',
  serializers: {
    error: stdSerializers.err,
  },
})

export type Logger = typeof logger
