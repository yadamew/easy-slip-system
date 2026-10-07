import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAIRetry, classifyAIError } from './ai-retry.js';
import OpenAI from 'openai';

const timeout = () => new TypeError('fetch failed', { cause: Object.assign(new Error('Headers Timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) });
for (const [name, failure] of [['503', () => Object.assign(new Error('busy'), { status:503 })], ['headers timeout', timeout], ['SDK timeout', () => new DOMException('aborted', 'AbortError')]]) {
    test(`${name}: retries twice then succeeds with backoff`, async () => {
        let calls = 0;
        const waits = [];
        const result = await withAIRetry(async () => { if (++calls < 3) throw failure(); return 'ok'; }, {sleep: async ms => waits.push(ms), random: () => 0});
        assert.equal(result, 'ok'); assert.equal(calls, 3); assert.deepEqual(waits, [1000, 2000]);
    });
    test(`${name}: stops after three failed attempts`, async () => {
        let calls = 0;
        const error = failure();
        await assert.rejects(withAIRetry(async () => { calls++; throw error; }, {sleep:async () => {}}), e => e === error);
        assert.equal(calls, 3);
    });
}
for (const status of [400, 401, 403, 404]) {
    test(`${status}: permanent errors are not retried`, async () => {
        let calls = 0;
        await assert.rejects(withAIRetry(async () => { calls++; throw Object.assign(new Error('invalid'), {status}); }));
        assert.equal(calls, 1);
    });
}
test('nested timeout is classified', () => assert.equal(classifyAIError(timeout()).timeout, true));
test('HTTP 504 is classified as a retryable timeout', () => {
    const info = classifyAIError({status:504});
    assert.equal(info.timeout, true);
    assert.equal(info.retryable, true);
});
test('OpenAI SDK timeout and connection errors are retryable', () => {
    assert.equal(classifyAIError(new OpenAI.APIConnectionTimeoutError()).timeout, true);
    assert.equal(classifyAIError(new OpenAI.APIConnectionTimeoutError()).retryable, true);
    assert.equal(classifyAIError(new OpenAI.APIConnectionError({})).network, true);
});
test('exhausted billing quota is not retried', () => {
    const info = classifyAIError({status:429, code:'insufficient_quota'});
    assert.equal(info.quota, true);
    assert.equal(info.retryable, false);
});
