import type { PgBoss } from '@dialogus/db'
import { describe, expect, it, vi } from 'vitest'
import { EnqueueError, enqueue } from '../../../src/infrastructure/pgboss/enqueue'

interface FakeBoss {
  boss: PgBoss
  startMock: ReturnType<typeof vi.fn>
  sendMock: ReturnType<typeof vi.fn>
  stopMock: ReturnType<typeof vi.fn>
}

function buildFakeBoss(sendResult: string | null = 'job-uuid-1'): FakeBoss {
  const startMock = vi.fn().mockResolvedValue(undefined)
  const sendMock = vi.fn().mockResolvedValue(sendResult)
  const stopMock = vi.fn().mockResolvedValue(undefined)
  const boss = {
    start: startMock,
    send: sendMock,
    stop: stopMock,
  } as unknown as PgBoss
  return { boss, startMock, sendMock, stopMock }
}

const DATABASE_URL = 'postgres://user:pw@127.0.0.1:5432/dialogus'

describe('apps/api enqueue helper', () => {
  it('creates a transient boss, starts, sends, stops, and returns the job id', async () => {
    const { boss, startMock, sendMock, stopMock } = buildFakeBoss('job-1')
    const createBoss = vi.fn().mockReturnValue(boss)

    const jobId = await enqueue({ databaseUrl: DATABASE_URL, createBoss }, 'ingestion.download', {
      bookId: 'b-1',
    })

    expect(jobId).toBe('job-1')
    expect(createBoss).toHaveBeenCalledWith(DATABASE_URL)
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('ingestion.download', { bookId: 'b-1' })
    expect(stopMock).toHaveBeenCalledTimes(1)
    expect(stopMock).toHaveBeenCalledWith({ graceful: false })
  })

  it('stops the boss even when send rejects', async () => {
    const { boss, sendMock, stopMock } = buildFakeBoss()
    sendMock.mockRejectedValueOnce(new Error('upstream'))
    const createBoss = vi.fn().mockReturnValue(boss)

    await expect(
      enqueue({ databaseUrl: DATABASE_URL, createBoss }, 'ingestion.download', {}),
    ).rejects.toThrow('upstream')

    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('throws EnqueueError when pg-boss returns null jobId', async () => {
    const { boss, stopMock } = buildFakeBoss(null)
    const createBoss = vi.fn().mockReturnValue(boss)

    const promise = enqueue({ databaseUrl: DATABASE_URL, createBoss }, 'queue.x', {})
    await expect(promise).rejects.toBeInstanceOf(EnqueueError)
    await expect(promise).rejects.toMatchObject({
      name: 'EnqueueError',
      queue: 'queue.x',
    })
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('orders calls as start → send → stop', async () => {
    const order: string[] = []
    const startMock = vi.fn(async () => {
      order.push('start')
    })
    const sendMock = vi.fn(async () => {
      order.push('send')
      return 'job-2'
    })
    const stopMock = vi.fn(async () => {
      order.push('stop')
    })
    const boss = {
      start: startMock,
      send: sendMock,
      stop: stopMock,
    } as unknown as PgBoss

    await enqueue({ databaseUrl: DATABASE_URL, createBoss: () => boss }, 'q', { foo: 'bar' })

    expect(order).toEqual(['start', 'send', 'stop'])
  })
})
