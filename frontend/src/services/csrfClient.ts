interface CsrfApiResponse {
  success: boolean;
  code: string;
  message: string;
  data: CsrfTokenContract;
}

export interface CsrfTokenContract {
  token: string;
  headerName: string;
}

export class CsrfBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsrfBootstrapError';
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

let currentToken: CsrfTokenContract | null = null;
let bootstrapPromise: Promise<CsrfTokenContract> | null = null;

export function clearCsrfToken(): void {
  currentToken = null;
}

export function getCsrfToken(): CsrfTokenContract | null {
  return currentToken;
}

export async function bootstrapCsrfToken(): Promise<CsrfTokenContract> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    let payload: CsrfApiResponse | null = null;
    try {
      payload = (await response.json()) as CsrfApiResponse;
    } catch {
      // The API may be unavailable or return a non-JSON proxy error.
    }

    const contract = payload?.data;
    if (!response.ok || !payload?.success || !contract?.token || !contract.headerName) {
      throw new CsrfBootstrapError(payload?.message || 'Unable to initialize CSRF protection');
    }

    currentToken = {
      token: contract.token,
      headerName: contract.headerName,
    };
    return currentToken;
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

export async function ensureCsrfToken(): Promise<CsrfTokenContract> {
  return currentToken ?? bootstrapCsrfToken();
}

export async function refreshCsrfToken(): Promise<CsrfTokenContract> {
  currentToken = null;
  return bootstrapCsrfToken();
}
