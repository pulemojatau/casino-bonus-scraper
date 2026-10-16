/**
 * Tiny fake for `fetch`: maps URLs to canned responses so tests never hit
 * the network.
 */
export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const route = routes[String(url)];
    if (route instanceof Error) throw route;
    if (!route) return new Response('not found', { status: 404 });
    const { status = 200, body = '', headers = {} } =
      typeof route === 'function' ? route(calls.length) : route;
    return new Response(body, { status, headers });
  };
  impl.calls = calls;
  return impl;
}

export const noSleep = async () => {};
