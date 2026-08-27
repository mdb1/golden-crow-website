type GmailMessageInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type GmailSendOptions = {
  from?: string;
  user?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  boundaryPrefix?: string;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function requiredConfigured(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is not configured`);
  }
  return normalized;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const sanitized = sanitizeHeader(value);
  return /^[\x20-\x7E]*$/.test(sanitized)
    ? sanitized
    : `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildRawGmailMessage(
  input: GmailMessageInput,
  options: GmailSendOptions = {},
) {
  const headers = [
    `From: ${sanitizeHeader(options.from ?? requiredEnv("MAIL_FROM"))}`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (!input.html) {
    return base64Url(
      [
        ...headers,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        input.text,
        "",
      ].join("\r\n"),
    );
  }

  const boundaryPrefix = options.boundaryPrefix ?? "gc-mail";
  const boundary = `${boundaryPrefix}-${Date.now().toString(36)}`;
  const multipartHeaders = [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    `--${boundary}--`,
    "",
  ];

  return base64Url([...multipartHeaders, "", ...body].join("\r\n"));
}

async function refreshAccessToken(options: GmailSendOptions = {}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredConfigured(
        options.clientId ?? process.env.GMAIL_CLIENT_ID,
        "GMAIL_CLIENT_ID",
      ),
      client_secret: requiredConfigured(
        options.clientSecret ?? process.env.GMAIL_CLIENT_SECRET,
        "GMAIL_CLIENT_SECRET",
      ),
      refresh_token: requiredConfigured(
        options.refreshToken ?? process.env.GMAIL_REFRESH_TOKEN,
        "GMAIL_REFRESH_TOKEN",
      ),
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google OAuth did not return an access token",
    );
  }
  return payload.access_token;
}

export async function sendGmailMessage(
  input: GmailMessageInput,
  options: GmailSendOptions = {},
) {
  const accessToken = await refreshAccessToken(options);
  const user = encodeURIComponent(
    requiredConfigured(options.user ?? process.env.GMAIL_USER, "GMAIL_USER"),
  );
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${user}/messages/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: buildRawGmailMessage(input, options) }),
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "Gmail API rejected the message");
  }
}
