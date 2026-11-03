import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const headers = new Map<string, string>()
const responseHeaders = new Map<string, string>()
let status = 200
const editor = vi.fn()
const grants = { getRequest: vi.fn(), approve: vi.fn(), deny: vi.fn(), connections: vi.fn(() => []), revoke: vi.fn(), revokeAll: vi.fn(), verifyAccess: vi.fn(() => null) }
const urls = { issuer: 'https://picblog.example.com', resource: 'https://picblog.example.com/mcp', resourceMetadata: 'https://picblog.example.com/.well-known/oauth-protected-resource/mcp' }

beforeEach(() => {
  headers.clear(); responseHeaders.clear(); status = 200
  vi.clearAllMocks()
  vi.stubGlobal('defineEventHandler', (handler: (event: object) => Promise<object>) => handler)
  vi.stubGlobal('requireEditor', editor)
  vi.stubGlobal('requireOAuthOrigin', () => { if (headers.get('origin') !== urls.issuer) throw new Error('origin denied') })
  vi.stubGlobal('setResponseHeader', (_event: object, key: string, value: string) => responseHeaders.set(key, value))
  vi.stubGlobal('setResponseStatus', (_event: object, value: number) => { status = value })
  vi.stubGlobal('getRequestHeader', (_event: object, key: string) => headers.get(key))
  vi.stubGlobal('useOAuthGrants', async () => grants)
  vi.stubGlobal('oauthUrls', () => urls)
  vi.stubGlobal('clientOrigins', () => ['https://claude.ai'])
  vi.stubGlobal('MCP_SCOPE', 'picblog')
  vi.stubGlobal('getRouterParam', () => 'request-id')
  vi.stubGlobal('readBody', async () => ({ allow: true }))
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage), input))
})
afterEach(() => vi.unstubAllGlobals())

// Imported after globals to evaluate Nitro's handler declarations without a running server.
const load = async () => {
  const [read, approve, connections, revoke, revokeAll, mcp] = await Promise.all([
    import('../api/oauth/requests/[id].get'), import('../api/oauth/requests/[id].post'),
    import('../api/oauth/connections/index.get'), import('../api/oauth/connections/[id].delete'),
    import('../api/oauth/connections/index.delete'), import('../routes/mcp'),
  ])
  return { read: read.default, approve: approve.default, connections: connections.default, revoke: revoke.default, revokeAll: revokeAll.default, mcp: mcp.default }
}

describe('OAuth and MCP route authentication', () => {
  it('all consent and management endpoints reject an unauthenticated caller before grant access', async () => {
    editor.mockRejectedValueOnce(new Error('unauthenticated')).mockRejectedValueOnce(new Error('unauthenticated')).mockRejectedValueOnce(new Error('unauthenticated')).mockRejectedValueOnce(new Error('unauthenticated')).mockRejectedValueOnce(new Error('unauthenticated'))
    const routes = await load()
    for (const route of [routes.read, routes.approve, routes.connections, routes.revoke, routes.revokeAll]) {
      await expect(route({} as never)).rejects.toThrow('unauthenticated')
    }
    expect(grants.approve).not.toHaveBeenCalled()
    expect(grants.connections).not.toHaveBeenCalled()
    expect(grants.revoke).not.toHaveBeenCalled()
  })
  it('consent and revocation require same-origin requests even with editor session', async () => {
    const routes = await load()
    headers.set('origin', 'https://evil.example')
    for (const route of [routes.approve, routes.revoke, routes.revokeAll]) await expect(route({} as never)).rejects.toThrow('origin denied')
    expect(grants.approve).not.toHaveBeenCalled()
    expect(grants.revokeAll).not.toHaveBeenCalled()
  })
  it('no token and invalid/revoked tokens yield HTTP 401 and an ASCII discovery challenge, never private data', async () => {
    const { mcp } = await load()
    for (const authorization of ['', 'Bearer revoked-token']) {
      headers.set('authorization', authorization)
      expect(await mcp({ method: 'POST' } as never)).toEqual({ error: 'unauthorized' })
      expect(status).toBe(401)
      expect(responseHeaders.get('www-authenticate')).toBe(`Bearer resource_metadata="${urls.resourceMetadata}"`)
    }
  })
  it('cross-origin MCP calls are denied before token verification', async () => {
    headers.set('origin', 'https://evil.example')
    const { mcp } = await load()
    await expect(mcp({ method: 'POST' } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(grants.verifyAccess).not.toHaveBeenCalled()
  })
})
