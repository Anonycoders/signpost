import { describe, expect, it, vi } from 'vitest';

import { postMessage, SlackError } from './slack';

/**
 * Every test here is about one fact: Slack says no with HTTP 200.
 *
 * A caller that trusts the status code treats a bot invited to no channel, a
 * revoked token and a typo in a channel name as three successes in a row, then
 * writes all three into the ledger as sent. The whole feature would fail
 * silently, in the one mode it exists to prevent.
 */

function reply(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

const send = (fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void> = async () => {}) =>
  postMessage({
    token: 'xoxb-test',
    channel: '#platform-news',
    text: 'Something changed.',
    fetchImpl,
    sleep,
  });

describe('a message Slack accepts', () => {
  it('posts the text to the channel and asks for no link previews', async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: true }));

    await send(fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xoxb-test');
    expect(JSON.parse(init.body as string)).toEqual({
      channel: '#platform-news',
      text: 'Something changed.',
      unfurl_links: false,
      unfurl_media: false,
    });
  });
});

describe('a message Slack refuses with a 200', () => {
  it('throws rather than reporting success', async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: false, error: 'not_in_channel' }));

    await expect(send(fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(SlackError);
  });

  it('says what to do about the first-run failure everyone hits', async () => {
    // A bot starts out in no channels at all, so this is not an edge case —
    // it is what happens the first time anyone turns this on.
    const fetchImpl = vi.fn(async () => reply({ ok: false, error: 'not_in_channel' }));

    await expect(send(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /\/invite @YourBotName/,
    );
  });

  it('carries Slack own code through, whether or not it has advice for it', async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: false, error: 'ratelimited_forever' }));

    await expect(send(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'ratelimited_forever',
      message: expect.stringContaining('ratelimited_forever'),
    });
  });

  it('does not invent an error code when Slack sends none', async () => {
    const fetchImpl = vi.fn(async () => reply({ ok: false }));

    await expect(send(fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'unknown_error',
    });
  });
});

describe('rate limiting', () => {
  it('waits the number of seconds Slack asks for, then posts', async () => {
    const responses = [
      reply({ error: 'ratelimited' }, { status: 429, headers: { 'retry-after': '3' } }),
      reply({ ok: true }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const slept: number[] = [];

    await send(fetchImpl as unknown as typeof fetch, async (ms: number) => {
      slept.push(ms);
    });

    expect(slept).toEqual([3000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('waits a second when Slack asks for no particular wait', async () => {
    const responses = [reply({}, { status: 429 }), reply({ ok: true })];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const slept: number[] = [];

    await send(fetchImpl as unknown as typeof fetch, async (ms: number) => {
      slept.push(ms);
    });

    expect(slept).toEqual([1000]);
  });

  it('gives up rather than retrying for ever', async () => {
    const fetchImpl = vi.fn(async () =>
      reply({ error: 'ratelimited' }, { status: 429, headers: { 'retry-after': '1' } }),
    );

    await expect(
      postMessage({
        token: 'xoxb-test',
        channel: '#platform-news',
        text: 'Something changed.',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: async () => {},
        retries: 2,
      }),
    ).rejects.toMatchObject({ code: 'http_429' });

    // Two waits, then one last attempt that is allowed to fail.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('a transport failure', () => {
  it('is reported as a failure to post, naming the channel', async () => {
    const fetchImpl = vi.fn(async () => new Response('gateway timeout', { status: 504 }));

    await expect(send(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /Nothing was posted to #platform-news/,
    );
  });
});
