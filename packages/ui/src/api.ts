export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Calls the Shopistan API through the app's own /api proxy, so session cookies
 * stay scoped to the app's host.
 */
export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection and try again.', 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data && typeof data === 'object' && data.message) || `Something went wrong (${res.status}). Please try again.`;
    throw new ApiError(Array.isArray(message) ? message[0] : message, res.status, data?.field, data?.code);
  }
  return data as T;
}
