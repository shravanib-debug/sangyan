/** CSRF defence for cookie-authenticated mutations: the Origin header must match the request host. */
export function isSameOrigin(request: { headers: Headers; url: string }): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
