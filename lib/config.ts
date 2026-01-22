// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// API Headers helper
export const getAPIHeaders = (includeContentType: boolean = true) => {
  const headers: Record<string, string> = {
    'X-API-SECRET': process.env.NEXT_PUBLIC_API_SECRET || '',
  };
  
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  
  return headers;
};

// API fetch helper
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Merge default headers with provided headers
  const defaultHeaders = getAPIHeaders(!options.body || typeof options.body === 'string');
  const headers = {
    ...defaultHeaders,
    ...options.headers,
  };
  
  return fetch(url, {
    ...options,
    headers,
  });
};