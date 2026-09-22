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

  const trimmedPath = baseUrl.pathname.replace(/\/+$/, '');
  baseUrl.pathname = trimmedPath.endsWith('/responses')
    ? trimmedPath
    : `${trimmedPath}/responses`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return { apiKey, model, responsesUrl: baseUrl.toString() };
}
