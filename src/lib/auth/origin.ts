/** CSRF defence for cookie-authenticated mutations: the Origin header must match the request host. */
export function isSameOrigin(request: { headers: Headers; url: string }): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host)
      .split(",")[0]!
      .trim();
    const protocol = (request.headers.get("x-forwarded-proto") ?? requestUrl.protocol)
      .split(",")[0]!
      .trim()
      .replace(/:$/, "");
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
