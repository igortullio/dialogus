import type { UserThreadDeleter } from '../../application/admin/ports'

export interface MastraThreadDeleterOptions {
  /** Mastra base URL, e.g. `http://localhost:4111`. */
  readonly baseUrl: string
  /** Agent id whose memory namespaces the threads (e.g. `dialogusAgent`). */
  readonly agentId: string
  /** Internal shared secret; attached as a Bearer token when Mastra enforces it (T018). */
  readonly authSecret?: string
  readonly fetchImpl?: typeof fetch
}

interface MastraThread {
  readonly id?: unknown
}

/**
 * Deletes a user's Mastra conversation threads by `resourceId` via Mastra's
 * memory HTTP API (account deletion, FR-023). Mastra tables are framework-owned
 * and not FK-linked to the app schema (deviation E2), so they cannot be cleaned
 * up by a DB cascade — this lists the user's threads then deletes each.
 */
export class MastraThreadDeleter implements UserThreadDeleter {
  private readonly threadsUrl: string

  constructor(private readonly options: MastraThreadDeleterOptions) {
    this.threadsUrl = `${options.baseUrl.replace(/\/+$/, '')}/api/memory/threads`
  }

  async deleteThreadsForUser(userId: string): Promise<void> {
    const ids = await this.listThreadIds(userId)
    for (const id of ids) await this.deleteThread(id)
  }

  private fetcher(): typeof fetch {
    return this.options.fetchImpl ?? fetch
  }

  private headers(): Headers {
    const headers = new Headers()
    if (this.options.authSecret) {
      headers.set('Authorization', `Bearer ${this.options.authSecret}`)
    }
    return headers
  }

  private async listThreadIds(userId: string): Promise<string[]> {
    const url = `${this.threadsUrl}?resourceId=${encodeURIComponent(userId)}&agentId=${encodeURIComponent(this.options.agentId)}`
    const res = await this.fetcher()(url, { headers: this.headers(), cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Mastra list threads failed for ${userId}: ${res.status}`)
    }
    const data = (await res.json().catch(() => null)) as unknown
    if (!Array.isArray(data)) return []
    return data
      .map((thread) => (thread as MastraThread).id)
      .filter((id): id is string => typeof id === 'string')
  }

  private async deleteThread(threadId: string): Promise<void> {
    const url = `${this.threadsUrl}/${encodeURIComponent(threadId)}?agentId=${encodeURIComponent(this.options.agentId)}`
    const res = await this.fetcher()(url, { method: 'DELETE', headers: this.headers() })
    // 404 = already gone; anything else non-2xx is a real failure.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Mastra delete thread ${threadId} failed: ${res.status}`)
    }
  }
}
