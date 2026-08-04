export const DEFAULT_DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 3005] as const;

export const LOCAL_API_CONNECTION_ERROR =
  "서버에 연결할 수 없습니다. 터미널에서 `bun run dev`를 실행한 뒤 http://localhost:3000 을 열어 주세요.";

const RETRYABLE_API_ERROR_MARKERS = [
  "sandbox network policy",
  "not on allow list",
  "openai_api_key is not set",
  "openai_api_key가 설정되지 않았습니다",
  "econnrefused",
  "fetch failed",
] as const;

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function buildLocalApiUrl(port: number, path: string): string {
  return `http://localhost:${port}${path}`;
}

function cloneResponse(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function isRetryableLocalApiResponse(
  response: Response,
  body: string,
): boolean {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return true;
  }

  if (response.status < 500) {
    return false;
  }

  const normalized = body.toLowerCase();
  return RETRYABLE_API_ERROR_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

/** Build fetch URL candidates for a same-origin API path in local development. */
export function resolveLocalApiCandidates(path: string): string[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") {
    return [normalizedPath];
  }

  const { protocol, hostname, port } = window.location;

  if (protocol === "file:") {
    return DEFAULT_DEV_PORTS.map((devPort) =>
      buildLocalApiUrl(devPort, normalizedPath),
    );
  }

  if (isLocalDevHost(hostname)) {
    const sameOrigin = port
      ? `${window.location.origin}${normalizedPath}`
      : normalizedPath;
    const fallbacks = DEFAULT_DEV_PORTS.filter(
      (devPort) => !port || String(devPort) !== port,
    ).map((devPort) => buildLocalApiUrl(devPort, normalizedPath));

    return [sameOrigin, ...fallbacks];
  }

  return [`${window.location.origin}${normalizedPath}`];
}

export async function fetchLocalApi(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const candidates = resolveLocalApiCandidates(path);
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];
    const isLastCandidate = index === candidates.length - 1;

    try {
      const response = await fetch(url, init);

      if (response.ok || isLastCandidate) {
        return response;
      }

      const body = await response.text();
      if (!isRetryableLocalApiResponse(response, body)) {
        return cloneResponse(response, body);
      }

      lastResponse = cloneResponse(response, body);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(`${LOCAL_API_CONNECTION_ERROR} (${lastError.message})`);
  }

  throw new Error(LOCAL_API_CONNECTION_ERROR);
}
