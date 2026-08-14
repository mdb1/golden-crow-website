type GmailMessageInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
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

function buildRawMessage(input: GmailMessageInput) {
  const boundary = `gc-consent-${Date.now().toString(36)}`;
  const headers = [
    `From: ${sanitizeHeader(requiredEnv("MAIL_FROM"))}`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
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

  return base64Url([...headers, "", ...body].join("\r\n"));
}

async function refreshAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GMAIL_CLIENT_ID"),
      client_secret: requiredEnv("GMAIL_CLIENT_SECRET"),
      refresh_token: requiredEnv("GMAIL_REFRESH_TOKEN"),
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

export async function sendGmailMessage(input: GmailMessageInput) {
  const accessToken = await refreshAccessToken();
  const user = encodeURIComponent(requiredEnv("GMAIL_USER"));
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${user}/messages/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: buildRawMessage(input) }),
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "Gmail API rejected the message");
  }
}
