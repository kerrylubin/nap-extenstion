import { google } from "googleapis";
import fs from "fs";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const TOKEN_PATH = path.join(process.cwd(), "data", "gmail_token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "data", "credentials.json");

const REDIRECT_URI = "http://localhost:3000/api/auth/callback";

export function getOAuthClient() {
  const envClientId = process.env.GMAIL_CLIENT_ID;
  const envClientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return new google.auth.OAuth2(envClientId, envClientSecret, REDIRECT_URI);
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      "credentials.json not found in /data. Download it from Google Cloud Console, or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in your env."
    );
  }
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id } = creds.installed || creds.web;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForToken(code: string) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  return tokens;
}

export function isAuthorized(): boolean {
  return fs.existsSync(TOKEN_PATH);
}

export async function checkGmailConnection(): Promise<boolean> {
  if (!fs.existsSync(TOKEN_PATH)) return false;
  try {
    const oAuth2Client = getOAuthClient();
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);
    
    // Check if access token is expired or close to expiry (10 seconds margin)
    const expiry = token.expiry_date ?? 0;
    if (expiry <= Date.now() + 10000) {
      await oAuth2Client.getAccessToken(); // forces automatic refresh under the hood
    }
    return true;
  } catch (err: unknown) {
    console.error("Gmail token validation failed:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("invalid_grant")) {
      if (fs.existsSync(TOKEN_PATH)) {
        try {
          fs.unlinkSync(TOKEN_PATH);
          console.warn("Deleted invalid/expired Gmail token file to allow reconnect.");
        } catch (unlinkErr) {
          console.error("Failed to delete expired token file:", unlinkErr);
        }
      }
    }
    return false;
  }
}

async function getAuthorizedClient() {
  const oAuth2Client = getOAuthClient();
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Not authorized. Please connect Gmail first.");
  }
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oAuth2Client.setCredentials(token);

  // Auto-refresh
  oAuth2Client.on("tokens", (tokens) => {
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }));
  });

  return oAuth2Client;
}

function makeEmailRaw(params: {
  to: string;
  subject: string;
  body: string;
  cvBase64: string;
  cvFilename: string;
  letterBase64: string;
  letterFilename: string;
  senderName: string;
  senderEmail: string;
}): string {
  const boundary = "napai_boundary_" + Date.now();
  const lines: string[] = [
    `From: ${params.senderName} <${params.senderEmail}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.cvFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${params.cvFilename}"`,
    "",
    params.cvBase64,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.letterFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${params.letterFilename}"`,
    "",
    params.letterBase64,
    "",
    `--${boundary}--`,
  ];

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function sendApplicationEmail(params: {
  to: string;
  jobTitle: string;
  company: string;
  emailBody: string;
  letterBase64: string;
  letterFilename: string;
  language?: "nl" | "en";
  cvBase64?: string;
  cvFilename?: string;
  senderName: string;
  senderEmail: string;
}): Promise<string> {
  const auth = await getAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth });

  // Resolve CV: use passed-in base64, or fall back to local file
  let cvBase64 = params.cvBase64;
  const cvFilename = params.cvFilename ?? `${params.senderName} CV.pdf`;
  if (!cvBase64) {
    const cvPath = path.join(process.cwd(), "public", "cv", `${params.senderName} CV.pdf`);
    if (!fs.existsSync(cvPath)) {
      throw new Error(`No CV provided and fallback not found at public/cv/${params.senderName} CV.pdf`);
    }
    cvBase64 = fs.readFileSync(cvPath).toString("base64");
  }

  const subject = params.language === "en"
    ? `Application: ${params.jobTitle} | ${params.senderName}`
    : `Sollicitatie: ${params.jobTitle} | ${params.senderName}`;
  const raw = makeEmailRaw({
    to: params.to,
    subject,
    body: params.emailBody,
    cvBase64,
    cvFilename,
    letterBase64: params.letterBase64,
    letterFilename: params.letterFilename,
    senderName: params.senderName,
    senderEmail: params.senderEmail,
  });

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return res.data.id ?? "sent";
  } catch (err: unknown) {
    console.error("Gmail send API error:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("invalid_grant")) {
      if (fs.existsSync(TOKEN_PATH)) {
        try {
          fs.unlinkSync(TOKEN_PATH);
          console.warn("Deleted invalid/expired Gmail token file due to invalid_grant on send.");
        } catch (unlinkErr) {
          console.error("Failed to delete expired token file:", unlinkErr);
        }
      }
      throw new Error("Gmail session expired or revoked (invalid_grant). Please connect Gmail again from the profile/dashboard.");
    }
    throw err;
  }
}
