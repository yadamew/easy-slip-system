import { setTimeout as delay } from 'node:timers/promises';

export const AI_TIMEOUT_MS = 120000;
export const AI_MAX_ATTEMPTS = 3;

export function classifyAIError(error) {
    let status;
    let timeout = false;
    let network = false;
    let quota = false;
    const seen = new Set();
    for (let current = error; current && !seen.has(current); current = current.cause) {
        seen.add(current);
        quota ||= current.code === 'insufficient_quota' || current.error?.code === 'insufficient_quota';
        const candidate = Number(current.status ?? current.statusCode);
        if (candidate >= 400 && candidate <= 599) status ??= candidate;
        timeout ||= ['AbortError', 'TimeoutError'].includes(current.name) || current.constructor?.name === 'APIConnectionTimeoutError'
            || ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'].includes(current.code);
        network ||= current.constructor?.name === 'APIConnectionError' || ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'UND_ERR_SOCKET'].includes(current.code)
            || /fetch failed/i.test(current.message ?? '');
    }
    timeout ||= status === 408 || status === 504;
    return { status, timeout, network, quota, retryable: !quota && (status ? [408, 429, 500, 502, 503, 504].includes(status) : timeout || network) };
}

export async function withAIRetry(operation, { sleep = delay, random = Math.random, onRetry = () => {} } = {}) {
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
        try { return await operation(); }
        catch (error) {
            const info = classifyAIError(error);
            if (!info.retryable || attempt === AI_MAX_ATTEMPTS) throw error;
            const waitMs = 1000 * 2 ** (attempt - 1) + Math.floor(random() * 500);
            onRetry({ attempt, waitMs, ...info });
            await sleep(waitMs);
        }
    }
}
