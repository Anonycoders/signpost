/**
 * Posting a message to Slack, and nothing else.
 *
 * One endpoint, one method, no SDK. `chat.postMessage` is a form POST that
 * returns JSON, and a dependency that wraps it would be a dependency an
 * adopting organization has to trust, review and keep patched for the sake of
 * twenty lines.
 *
 * The one thing that must not be got wrong: **a failure arrives as HTTP 200.**
 * Slack answers almost everything with 200 and puts the verdict in the body, so
 * checking `response.ok` alone reports every misconfiguration in this feature as
 * a success. `not_in_channel` in particular is the normal state of a bot that
 * has been invited nowhere — the single most likely thing to go wrong on a first
 * run, and the one an adopter most needs told.
 */

const POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

export interface PostOptions {
  token: string;
  channel: string;
  text: string;
  /** Injected by the tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Injected by the tests, so a retry does not cost a real second. */
  sleep?: (ms: number) => Promise<void>;
  /** How many times to wait out a rate limit before giving up. */
  retries?: number;
}

export class SlackError extends Error {
  /** Slack's own error code — `not_in_channel`, `invalid_auth`, `channel_not_found`. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SlackError';
    this.code = code;
  }
}

/** What Slack's own codes mean for someone who is setting this up. */
const ADVICE: Record<string, string> = {
  not_in_channel:
    'The bot is not in that channel. Invite it: type `/invite @YourBotName` in the channel. A bot can post only where it has been invited, private channels included.',
  channel_not_found:
    'No such channel. Check the spelling, and remember a private channel is invisible to the bot until it is invited.',
  invalid_auth:
    'Slack rejected the token. Check the SLACK_BOT_TOKEN secret holds the bot token (it starts `xoxb-`), not the app or user token.',
  missing_scope:
    'The app is missing the `chat:write` scope. Add it under OAuth & Permissions, then reinstall the app to the workspace.',
  is_archived: 'That channel is archived, so nothing can be posted to it. Point at a live one.',
};

const describe = (code: string): string => ADVICE[code] ?? `Slack refused the message: ${code}.`;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Post one message, waiting out a rate limit if Slack asks.
 *
 * Resolves when Slack has accepted it and throws otherwise, so a caller can
 * treat "this was said" as a fact rather than a hope — which matters, because
 * the ledger is written on the strength of it.
 */
export async function postMessage(options: PostOptions): Promise<void> {
  const {
    token,
    channel,
    text,
    fetchImpl = fetch,
    sleep = wait,
    retries = 3,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(POST_MESSAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text,
        // The site is the detail. An unfurled preview of the page under every
        // message would double the height of the channel for nothing.
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    // Slack asks for a wait in seconds and means it: posting through a 429
    // gets the app rate-limited harder, not faster.
    if (response.status === 429 && attempt < retries) {
      const after = Number(response.headers.get('retry-after') ?? '1');
      await sleep((Number.isFinite(after) && after > 0 ? after : 1) * 1000);
      continue;
    }

    if (!response.ok) {
      throw new SlackError(
        `http_${response.status}`,
        `Slack replied ${response.status} ${response.statusText}. Nothing was posted to ${channel}.`,
      );
    }

    const body = (await response.json()) as { ok?: boolean; error?: string };

    // The whole reason this file exists rather than a two-line fetch.
    if (body.ok !== true) {
      const code = body.error ?? 'unknown_error';
      throw new SlackError(code, `Could not post to ${channel} (${code}). ${describe(code)}`);
    }

    return;
  }
}
