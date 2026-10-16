// __tests__/smtp-send.test.ts — issue #970.
//
// `sendMail` / `isEmailConfigured` against a mocked nodemailer. What these pin:
//   - "disabled" is the answer with ANY credential missing, and NO transport is
//     created (a preview deploy must not even try to connect);
//   - the App Password is de-spaced on its way to the transport (the #970 bug);
//   - From defaults to "Corvo <user>" and honours GC_FITNESS_MAIL_FROM;
//   - TLS is derived from the port (465 implicit TLS, anything else STARTTLS);
//   - replyTo only travels when given;
//   - a transport error comes back as `failed` with a detail — never a throw.

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn((_opts: unknown) => ({ sendMail: mockSendMail }));

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: (opts: unknown) => mockCreateTransport(opts) },
}));

import { isEmailConfigured, sendMail } from "../email/smtp";

const ENV_KEYS = [
  "GC_FITNESS_SMTP_HOST",
  "GC_FITNESS_SMTP_USER",
  "GC_FITNESS_SMTP_PASSWORD",
  "GC_FITNESS_SMTP_PORT",
  "GC_FITNESS_MAIL_FROM",
] as const;

const saved: Record<string, string | undefined> = {};

const MAIL = {
  to: "client@example.com",
  subject: "Welcome",
  text: "hi",
  html: "<p>hi</p>",
};

function configure(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  process.env.GC_FITNESS_SMTP_HOST = "smtp.gmail.com";
  process.env.GC_FITNESS_SMTP_USER = "coach@goldencrow.app";
  process.env.GC_FITNESS_SMTP_PASSWORD = "abcd efgh ijkl mnop";
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  mockSendMail.mockReset().mockResolvedValue({ messageId: "m1" });
  mockCreateTransport.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("unconfigured → disabled, nothing attempted", () => {
  it.each([
    ["no env at all", {}],
    ["host missing", { GC_FITNESS_SMTP_USER: "u@x.com", GC_FITNESS_SMTP_PASSWORD: "pw" }],
    ["user missing", { GC_FITNESS_SMTP_HOST: "h", GC_FITNESS_SMTP_PASSWORD: "pw" }],
    ["password missing", { GC_FITNESS_SMTP_HOST: "h", GC_FITNESS_SMTP_USER: "u@x.com" }],
    ["host is only whitespace", { GC_FITNESS_SMTP_HOST: "   ", GC_FITNESS_SMTP_USER: "u@x.com", GC_FITNESS_SMTP_PASSWORD: "pw" }],
    ["password is only whitespace", { GC_FITNESS_SMTP_HOST: "h", GC_FITNESS_SMTP_USER: "u@x.com", GC_FITNESS_SMTP_PASSWORD: "   " }],
  ])("%s", async (_label, env) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    expect(isEmailConfigured()).toBe(false);
    await expect(sendMail(MAIL)).resolves.toEqual({ ok: false, reason: "disabled" });
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe("configured", () => {
  it("is configured once host, user and password are all set", () => {
    configure();
    expect(isEmailConfigured()).toBe(true);
  });

  it("strips the App Password spaces and defaults to port 465 with implicit TLS", async () => {
    configure();
    await expect(sendMail(MAIL)).resolves.toEqual({ ok: true });
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "coach@goldencrow.app", pass: "abcdefghijklmnop" },
    });
  });

  it("sends from 'Corvo <user>' by default, with no replyTo key when none is given", async () => {
    configure();
    await sendMail(MAIL);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const sent = mockSendMail.mock.calls[0][0];
    expect(sent).toEqual({
      from: "Corvo <coach@goldencrow.app>",
      to: "client@example.com",
      subject: "Welcome",
      text: "hi",
      html: "<p>hi</p>",
    });
    expect(sent).not.toHaveProperty("replyTo");
  });

  it("honours GC_FITNESS_MAIL_FROM (trimmed) and forwards replyTo", async () => {
    configure({ GC_FITNESS_MAIL_FROM: "  Coach Team <team@goldencrow.app>  " });
    await sendMail({ ...MAIL, replyTo: "coach@example.com" });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({
      from: "Coach Team <team@goldencrow.app>",
      replyTo: "coach@example.com",
    });
  });

  it("falls back to the default From when GC_FITNESS_MAIL_FROM is blank", async () => {
    configure({ GC_FITNESS_MAIL_FROM: "   " });
    await sendMail(MAIL);
    expect(mockSendMail.mock.calls[0][0].from).toBe("Corvo <coach@goldencrow.app>");
  });

  it("uses STARTTLS (secure: false) on 587", async () => {
    configure({ GC_FITNESS_SMTP_PORT: "587" });
    await sendMail(MAIL);
    expect(mockCreateTransport.mock.calls[0][0]).toMatchObject({ port: 587, secure: false });
  });

  it.each(["abc", "0", "-25"])("an unusable port %p falls back to 465 / TLS", async (port) => {
    configure({ GC_FITNESS_SMTP_PORT: port });
    await sendMail(MAIL);
    expect(mockCreateTransport.mock.calls[0][0]).toMatchObject({ port: 465, secure: true });
  });

  it("leaves a non-Google password containing spaces intact (only trimmed)", async () => {
    configure({ GC_FITNESS_SMTP_PASSWORD: "  correct horse battery  " });
    await sendMail(MAIL);
    expect(mockCreateTransport.mock.calls[0][0]).toMatchObject({
      auth: { user: "coach@goldencrow.app", pass: "correct horse battery" },
    });
  });

  it("returns failed + detail (never throws) when the transport rejects", async () => {
    configure();
    mockSendMail.mockRejectedValueOnce(new Error("535 Username and Password not accepted"));
    await expect(sendMail(MAIL)).resolves.toEqual({
      ok: false,
      reason: "failed",
      detail: "535 Username and Password not accepted",
    });
  });

  it("stringifies a non-Error rejection into detail", async () => {
    configure();
    mockSendMail.mockRejectedValueOnce("ECONNRESET");
    await expect(sendMail(MAIL)).resolves.toEqual({
      ok: false,
      reason: "failed",
      detail: "ECONNRESET",
    });
  });
});
