export interface MockFetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

export type MockFetchHandler = (call: MockFetchCall) => Promise<Response>;

export function installMockFetch(handler: MockFetchHandler): MockFetchCall[] {
  const calls: MockFetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    const call: MockFetchCall = { input, init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

export function jsonErrorResponse(
  body: Record<string, unknown>,
  init: ResponseInit & { status: number },
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    status: init.status,
    statusText: init.statusText,
  });
}

export function textResponse(text: string, init: ResponseInit = {}): Response {
  return new Response(text, init);
}
