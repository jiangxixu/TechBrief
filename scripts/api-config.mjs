const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export function getApiConfig() {
  const apiKey = required('OPENAI_API_KEY');
  const model = required('OPENAI_MODEL');
  const rawBaseUrl = required('OPENAI_BASE_URL');

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('OPENAI_BASE_URL must be a valid URL');
  }

  if (baseUrl.protocol !== 'https:') {
    throw new Error('OPENAI_BASE_URL must use HTTPS');
  }
  if (baseUrl.username || baseUrl.password) throw new Error('OPENAI_BASE_URL must not contain credentials');
  // This is a base URL, not a chat/completions endpoint. Never guess /v1.
  if (/\/chat\/completions\/?$/.test(baseUrl.pathname)) throw new Error('OPENAI_BASE_URL must be a base path or a /responses endpoint');

  const trimmedPath = baseUrl.pathname.replace(/\/+$/, '');
  baseUrl.pathname = trimmedPath.endsWith('/responses')
    ? trimmedPath
    : `${trimmedPath}/responses`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return { apiKey, model, responsesUrl: baseUrl.toString() };
}

