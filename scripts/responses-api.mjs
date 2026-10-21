// Bound retries to one shared deadline; never log provider bodies or credentials.
export async function callResponsesApi(config, body, audit, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const signal = AbortSignal.timeout(180_000);
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = await fetchImpl(config.responsesUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal
      });
      const raw = await response.text();
      const call = { status: response.status, requestId: response.headers.get('x-request-id'), attempt };
      audit.apiCalls.push(call);
      if (response.ok) {
        try { return JSON.parse(raw); }
        catch { throw Error('Responses API returned a non-JSON response'); }
      }
      let details;
      try { details = JSON.parse(raw).error; } catch {}
      const code = /^[a-z_]{1,80}$/.test(details?.code || '') ? details.code : undefined;
      const type = /^[a-z_]{1,80}$/.test(details?.type || '') ? details.type : undefined;
      const classification = /overload|capacity|no available|upstream|temporar|try again|busy/i.test(raw) ? 'upstream_unavailable'
        : /quota|credit|balance|billing/i.test(raw) ? 'quota'
        : /rate.?limit|too many requests/i.test(raw) ? 'rate_limit'
        : /unsupported|not supported|invalid.*parameter|unknown.*parameter/i.test(raw) ? 'unsupported_request'
        : 'provider_error';
      Object.assign(call, { code, type, classification });
      const error = new Error(`Responses API returned HTTP ${response.status} (${code || type || classification})`);
      Object.assign(error, { status: response.status, code: code || type || classification });
      // This custom gateway also intermittently reports HTTP 400 for requests
      // that succeed unchanged. Retry once, excluding explicit permanent errors.
      const permanent = ['quota', 'unsupported_request'].includes(classification)
        || code === 'invalid_json_schema' || /invalid_api_key|authentication|model_not_found/.test(code || type || '');
      const retryable = [400, 408, 429].includes(response.status) || response.status >= 500;
      if (attempt === 2 || !retryable || permanent) throw error;
      const seconds = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10000) : 2000);
    } catch (error) {
      if (response || attempt === 2 || signal.aborted) throw error;
      audit.apiCalls.push({ status: null, attempt, classification: 'network_error' });
      await sleep(2000);
    }
  }
}
