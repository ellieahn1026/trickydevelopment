export const DEFAULT_DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 3005] as const;

export const LOCAL_API_CONNECTION_ERROR =
  "서버에 연결할 수 없습니다. 터미널에서 `bun run dev`를 실행한 뒤 http://localhost:3000 을 열어 주세요.";

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function buildLocalApiUrl(port: number, path: string): string {
  return `http://localhost:${port}${path}`;
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

  for (const url of candidates) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(`${LOCAL_API_CONNECTION_ERROR} (${lastError.message})`);
  }

  throw new Error(LOCAL_API_CONNECTION_ERROR);
}
