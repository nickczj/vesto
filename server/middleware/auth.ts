import { isAuthorized } from '~~/server/utils/basic-auth'

/**
 * A second layer in front of the app. Ingress is already Tailscale-only, but
 * the container ports are published on the LAN and the app has no other
 * authentication. Public paths are limited to the deploy health check and
 * static assets, which carry no data.
 */
const PUBLIC_PATHS = new Set(['/api/healthz', '/favicon.ico', '/robots.txt'])
const PUBLIC_PREFIXES = ['/_nuxt/', '/__nuxt']

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))
}

export default defineEventHandler((event) => {
  if (isPublicPath(getRequestURL(event).pathname)) {
    return
  }

  const config = useRuntimeConfig()
  const expected = {
    user: String(config.authUser || 'vesto'),
    password: String(config.authPassword || ''),
  }

  if (!expected.password) {
    // Local development stays frictionless; production fails closed rather
    // than silently serving the balance sheet without a password.
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    throw createError({
      statusCode: 503,
      statusMessage: 'Authentication is not configured',
    })
  }

  if (isAuthorized(getHeader(event, 'authorization'), expected)) {
    return
  }

  setHeader(event, 'WWW-Authenticate', 'Basic realm="Vesto", charset="UTF-8"')
  throw createError({
    statusCode: 401,
    statusMessage: 'Authentication required',
  })
})
