import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMAIL_LOGS_PATH = path.join(__dirname, '.db', 'email_logs.json');

// Ensure .db directory exists
const dbDir = path.join(__dirname, '.db');
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {}
}

/**
 * Robustly parses and loads .env file into process.env
 */
export function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const k = trimmed.substring(0, eqIdx).trim();
            const v = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (v !== '') {
              process.env[k] = v;
            }
          }
        }
      });
    } catch (e) {
      console.debug('[EmailService] Error parsing .env:', e.message);
    }
  }
}

// Initial load
loadEnvFile();

/**
 * Retrieves the current SMTP and notification configuration
 */
export function getSmtpConfig() {
  loadEnvFile();
  const host = (process.env.SMTP_HOST || 'smtp.zoho.in').trim();
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || 'accounts@mayankzen.in').trim();
  const pass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const notificationEmail = (process.env.NOTIFICATION_EMAIL || 'account@mayankzen.in').trim();
  
  let emailFrom = (process.env.EMAIL_FROM || '').trim();
  if (!emailFrom) {
    emailFrom = `"MayankZen Studios" <${user}>`;
  } else if (!emailFrom.includes('<') && emailFrom.includes('@')) {
    emailFrom = `"MayankZen Studios" <${emailFrom}>`;
  }

  return {
    host,
    port,
    user,
    pass,
    notificationEmail,
    emailFrom
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function logEmailDispatch(emailData) {
  try {
    let logs = [];
    if (fs.existsSync(EMAIL_LOGS_PATH)) {
      try {
        logs = JSON.parse(fs.readFileSync(EMAIL_LOGS_PATH, 'utf8'));
      } catch (e) {
        logs = [];
      }
    }
    logs.unshift({
      id: 'email_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      ...emailData
    });
    // Keep last 150 emails
    if (logs.length > 150) logs = logs.slice(0, 150);
    fs.writeFileSync(EMAIL_LOGS_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[EmailService] Failed to log email record:', err);
  }
}

// Transporter cache & pool to avoid connection churn and Zoho rate-limits
let cachedTransporter = null;
let cachedTransporterKey = null;

export function clearTransporterCache() {
  if (cachedTransporter && typeof cachedTransporter.close === 'function') {
    try { cachedTransporter.close(); } catch (e) {}
  }
  cachedTransporter = null;
  cachedTransporterKey = null;
}

/**
 * Builds and verifies an active nodemailer transporter with automatic host & port failover
 */
export async function getTransporter() {
  const cfg = getSmtpConfig();

  if (!cfg.user || !cfg.pass) {
    return {
      transporter: null,
      error: 'SMTP credentials (SMTP_USER / SMTP_PASS) not configured in .env',
      cfg
    };
  }

  const currentKey = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`;
  if (cachedTransporter && cachedTransporterKey === currentKey) {
    return {
      transporter: cachedTransporter,
      host: cfg.host,
      port: cfg.port,
      cfg
    };
  }

  // Build candidate configurations (ordered by highest likelihood of delivery)
  const candidateConfigs = [];

  // Primary specified config
  candidateConfigs.push({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465
  });

  // Zoho India endpoints (authoritative for mayankzen.in and .in domains)
  candidateConfigs.push(
    { host: 'smtp.zoho.in', port: 465, secure: true },
    { host: 'smtp.zoho.in', port: 587, secure: false, requireTLS: true },
    { host: 'smtppro.zoho.in', port: 465, secure: true },
    { host: 'smtppro.zoho.in', port: 587, secure: false, requireTLS: true },
    { host: 'smtp.zoho.com', port: 465, secure: true },
    { host: 'smtp.zoho.com', port: 587, secure: false, requireTLS: true }
  );

  // De-duplicate configs
  const seen = new Set();
  const uniqueConfigs = candidateConfigs.filter(c => {
    const key = `${c.host}:${c.port}:${c.secure}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let lastError = null;

  for (const conf of uniqueConfigs) {
    try {
      const transporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        host: conf.host,
        port: conf.port,
        secure: conf.secure,
        requireTLS: conf.requireTLS || false,
        auth: {
          user: cfg.user,
          pass: cfg.pass
        },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 7000,
        greetingTimeout: 7000
      });

      await transporter.verify();

      cachedTransporter = transporter;
      cachedTransporterKey = currentKey;

      return {
        transporter,
        host: conf.host,
        port: conf.port,
        cfg
      };
    } catch (err) {
      lastError = err;
      console.warn(`[EmailService] SMTP endpoint ${conf.host}:${conf.port} failed: ${err.message}`);
    }
  }

  return {
    transporter: null,
    error: lastError ? lastError.message : 'Could not establish connection to any SMTP host',
    cfg
  };
}

/**
 * Automatically triggers an admin alert email to the studio notification address
 * whenever a new project request is submitted.
 */
export async function sendNewProjectAdminAlertEmail(request) {
  if (!request) {
    return { success: false, message: 'No request payload provided' };
  }

  const cfg = getSmtpConfig();
  const recipient = cfg.notificationEmail || 'account@mayankzen.in';
  const trackingId = request.trackingId || ('MS-' + Math.floor(1000 + Math.random() * 9000));
  const serviceName = request.service || 'Custom Development Service';
  const clientName = request.name || 'Anonymous Client';
  const clientEmail = request.email || 'Not provided';
  const clientMobile = request.mobile || request.phone || 'Not provided';
  const budget = request.budget ? `₹${Number(request.budget).toLocaleString('en-IN')}` : 'Custom Scope';
  const status = request.status || 'Pending';
  const description = request.description || request.brief || 'No description provided';
  const attachments = Array.isArray(request.attachments) ? request.attachments : [];

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const subject = `🚨 New Project Request [${trackingId}]: ${clientName} - ${serviceName} | MayankZen Studios`;
  const adminUrl = 'https://mayankzen.in/admin.html';
  const trackUrl = `https://mayankzen.in/track/?id=${encodeURIComponent(trackingId)}`;

  const attachmentsListHtml = attachments.length > 0
    ? attachments.map(att => `<li style="margin-bottom: 4px; color: #38bdf8;">${escapeHtml(att.name || att.filename || 'File')} ${att.size ? `<span style="color: #94a3b8; font-size: 11px;">(${Math.round(att.size / 1024)} KB)</span>` : ''}</li>`).join('')
    : '<li style="color: #64748b; font-style: italic;">No attachments uploaded</li>';

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Project Request Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #080d1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #080d1a; padding: 35px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 640px; background: #0f172a; border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 30px 35px 22px 35px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 60%, #0369a1 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block; padding: 5px 12px; background: rgba(0, 240, 255, 0.15); border: 1px solid rgba(0, 240, 255, 0.4); border-radius: 999px; color: #00f0ff; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px;">
                      ⚡ Action Required &bull; New Incoming Project
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">
                      New Project Submission Received
                    </h1>
                    <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
                      MayankZen Studios &bull; Automated Dispatch to <strong>${escapeHtml(recipient)}</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 30px 35px;">

              <!-- Key Metrics Grid -->
              <table role="presentation" width="100%" style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8; width: 38%;">Tracking ID:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; font-weight: 800; color: #00f0ff; font-family: monospace;">
                    <a href="${trackUrl}" target="_blank" style="color: #00f0ff; text-decoration: underline;">${escapeHtml(trackingId)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Client Name:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; font-weight: 700; color: #ffffff;">${escapeHtml(clientName)}</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Client Email:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; color: #38bdf8; font-weight: 600;">
                    <a href="mailto:${escapeHtml(clientEmail)}?subject=Re:%20MayankZen%20Project%20Request%20[${encodeURIComponent(trackingId)}]" style="color: #38bdf8; text-decoration: none;">${escapeHtml(clientEmail)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Client Phone / Mobile:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #cbd5e1;">${escapeHtml(clientMobile)}</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Service Requested:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; font-weight: 700; color: #f1f5f9;">${escapeHtml(serviceName)}</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Estimated Budget:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; font-weight: 700; color: #34d399;">${escapeHtml(budget)}</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Initial Status:</td>
                  <td style="padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px;">
                    <span style="display: inline-block; padding: 2px 8px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 4px; color: #facc15; font-weight: 700;">
                      ${escapeHtml(status)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; font-size: 13px; color: #94a3b8;">Submission Timestamp:</td>
                  <td style="padding: 7px 0; font-size: 13px; color: #cbd5e1;">${escapeHtml(dateStr)}</td>
                </tr>
              </table>

              <!-- Project Scope / Brief -->
              <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 10px; padding: 18px; margin-bottom: 22px;">
                <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                  Project Brief &amp; Scope:
                </div>
                <div style="font-size: 14px; line-height: 1.6; color: #e2e8f0; white-space: pre-line;">
                  ${escapeHtml(description)}
                </div>
              </div>

              <!-- Attachments Section -->
              <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 14px 18px; margin-bottom: 26px;">
                <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">
                  Uploaded Assets (${attachments.length}):
                </div>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
                  ${attachmentsListHtml}
                </ul>
              </div>

              <!-- Quick CTA Buttons -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${adminUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #00f0ff 0%, #0077ff 100%); color: #020617; text-decoration: none; font-weight: 800; font-size: 13px; border-radius: 8px; margin: 4px; box-shadow: 0 4px 15px rgba(0, 240, 255, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">
                      Open Admin Console &rarr;
                    </a>
                    <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: 12px 20px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 13px; border-radius: 8px; margin: 4px;">
                      View Live Tracker
                    </a>
                    ${clientEmail && clientEmail.includes('@') ? `
                    <a href="mailto:${escapeHtml(clientEmail)}?subject=Re:%20MayankZen%20Project%20Request%20[${encodeURIComponent(trackingId)}]" style="display: inline-block; padding: 12px 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; text-decoration: none; font-weight: 700; font-size: 13px; border-radius: 8px; margin: 4px;">
                      Reply to Client
                    </a>
                    ` : ''}
                  </td>
                </tr>
              </table>

              <!-- Footer Signature -->
              <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 18px; font-size: 12px; color: #64748b; line-height: 1.5;">
                <p style="margin: 0;">MayankZen Studios &bull; Automated Backend Dispatch Service</p>
                <p style="margin: 2px 0 0 0;">Notification configured for: <strong style="color: #94a3b8;">${escapeHtml(recipient)}</strong> via SMTP.</p>
              </div>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textContent = `
MayankZen Studios - New Project Request Alert
Recipient: ${recipient}

A new project request was successfully submitted:

--- REQUEST OVERVIEW ---
Tracking ID: ${trackingId}
Client Name: ${clientName}
Client Email: ${clientEmail}
Client Phone: ${clientMobile}
Service Requested: ${serviceName}
Estimated Budget: ${budget}
Status: ${status}
Submitted Date: ${dateStr}

--- BRIEF / SCOPE ---
${description}

--- ATTACHMENTS (${attachments.length}) ---
${attachments.length > 0 ? attachments.map(a => `- ${a.name || 'File'} (${Math.round((a.size || 0)/1024)} KB)`).join('\n') : 'None'}

--- QUICK ACTIONS ---
Admin Console: ${adminUrl}
Track Portal: ${trackUrl}
Reply Direct: mailto:${clientEmail}?subject=Re:%20MayankZen%20Project%20Request%20[${trackingId}]
  `.trim();

  let sentLive = false;
  let deliveryError = null;
  let unblockRequired = false;
  let messageId = null;

  try {
    const { transporter, error: connErr } = await getTransporter();
    if (transporter) {
      const sendOptions = {
        from: `"MayankZen Studios Alerts" <${cfg.user}>`,
        to: recipient,
        subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-Notification-Type': 'new-project-alert',
          'X-Tracking-ID': trackingId
        }
      };

      if (clientEmail && clientEmail.includes('@')) {
        sendOptions.replyTo = clientEmail;
      }

      const info = await transporter.sendMail(sendOptions);
      sentLive = true;
      messageId = info.messageId;
      console.log(`[EmailService] Admin alert email successfully sent to ${recipient}: ${messageId}`);
    } else {
      deliveryError = connErr || 'No active SMTP transporter available';
      console.warn(`[EmailService] SMTP transporter unavailable for admin alert: ${deliveryError}`);
    }
  } catch (err) {
    deliveryError = err.message;
    if (err.message.includes('Unusual sending activity detected') || err.message.includes('UnblockMe')) {
      unblockRequired = true;
    }
    console.error(`[EmailService] Error dispatching admin alert email to ${recipient}:`, err.message);
  }

  // Audit log
  logEmailDispatch({
    recipient,
    clientName,
    service: serviceName,
    trackingId,
    status,
    sender: cfg.user,
    subject,
    sentLive,
    type: 'admin_alert',
    error: deliveryError,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    messageId,
    deliveredAt: new Date().toISOString()
  });

  return {
    success: sentLive,
    sentLive,
    trackingId,
    recipient,
    subject,
    messageId,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    error: deliveryError
  };
}

/**
 * Sends a formal confirmation email to the client upon service request submission.
 */
export async function sendServiceRequestConfirmationEmail(request) {
  const cleanEmail = (request?.email || '').trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    console.warn('[EmailService] Skipped sending confirmation email: No recipient email provided.');
    return { success: false, sentLive: false, message: 'No valid recipient email provided' };
  }

  const cfg = getSmtpConfig();
  const trackingId = request.trackingId || 'MS-PENDING';
  const serviceName = request.service || 'Custom Development Service';
  const clientName = request.name || 'Valued Client';
  const status = request.status || 'Pending';
  const budget = request.budget ? `₹${Number(request.budget).toLocaleString('en-IN')}` : 'Custom Scope';
  const description = request.description || 'Details submitted via client portal';
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const trackUrl = `https://mayankzen.in/track/?id=${encodeURIComponent(trackingId)}`;
  const subject = `Service Request Confirmed [${trackingId}] - ${serviceName} | MayankZen Studios`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Request Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 620px; background: #131b2e; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 35px 35px 25px 35px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block; padding: 6px 14px; background: rgba(0, 240, 255, 0.12); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 999px; color: #00f0ff; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px;">
                      Official Confirmation
                    </div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      MayankZen Studios
                    </h1>
                    <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">
                      Engineering &bull; Web Development &bull; AI Automation
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 35px;">
              <p style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.6; color: #e2e8f0;">
                Dear <strong>${escapeHtml(clientName)}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Thank you for choosing <strong>MayankZen Studios</strong>. We are pleased to confirm that your service request has been successfully submitted and logged into our production queue.
              </p>

              <!-- Request Details Box -->
              <table role="presentation" width="100%" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8; width: 40%;">Tracking ID:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; font-weight: 700; color: #00f0ff; font-family: monospace;">${escapeHtml(trackingId)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Service Requested:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; font-weight: 600; color: #ffffff;">${escapeHtml(serviceName)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Current Status:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; font-weight: 700;">
                    <span style="display: inline-block; padding: 3px 10px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 6px; color: #facc15;">
                      ${escapeHtml(status)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Estimated Budget:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 14px; color: #e2e8f0;">${escapeHtml(budget)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #94a3b8;">Submission Date:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; color: #cbd5e1;">${escapeHtml(dateStr)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-size: 13px; color: #94a3b8; vertical-align: top;">Project Brief:</td>
                  <td style="padding: 8px 0; font-size: 13px; color: #cbd5e1; line-height: 1.5;">${escapeHtml(description)}</td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #0066ff 0%, #00c2ff 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 102, 255, 0.4); text-align: center;">
                      Track Your Request Real-Time &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                Our engineering team is actively evaluating your project specifications. If we require any architectural clarification, we will reach out directly to you via this email. You can also chat directly with our team anytime using your tracking link above.
              </p>

              <!-- Formal Ending -->
              <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1;">
                <p style="margin: 0 0 6px 0; font-size: 14px; color: #94a3b8;">Warm regards,</p>
                <p style="margin: 0; font-size: 16px; font-weight: 800; color: #ffffff;">Mayank Kumar</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #00c2ff; font-weight: 600;">Founder &amp; Principal Full-Stack Engineer</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #94a3b8;">MayankZen Studios</p>
                
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top: 12px; font-size: 12px; color: #64748b;">
                  <tr>
                    <td style="padding-right: 12px;">Official Email: <a href="mailto:account@mayankzen.in" style="color: #00c2ff; text-decoration: none;">account@mayankzen.in</a></td>
                    <td style="padding-right: 12px;">&bull;</td>
                    <td>Website: <a href="https://mayankzen.in" style="color: #00c2ff; text-decoration: none;">mayankzen.in</a></td>
                  </tr>
                  <tr>
                    <td colspan="3" style="padding-top: 4px; font-size: 11px; color: #475569;">
                      New Delhi, India &bull; High-Performance Web &amp; Scalable Software Architecture
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 35px; background: rgba(0, 0, 0, 0.4); border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center; font-size: 11px; color: #64748b;">
              This is an automated confirmation sent on behalf of MayankZen Studios. Please retain this email and your Tracking ID for future reference.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textContent = `
MayankZen Studios - Service Request Confirmation

Dear ${clientName},

Thank you for choosing MayankZen Studios. We are pleased to confirm that your service request has been successfully submitted and logged into our system.

--- REQUEST DETAILS ---
Tracking ID: ${trackingId}
Service Requested: ${serviceName}
Current Status: ${status}
Estimated Budget: ${budget}
Submitted On: ${dateStr}

Project Brief:
${description}

--- TRACK YOUR PROJECT ---
Track your real-time progress and chat with our team:
${trackUrl}

Our engineering team is actively evaluating your project specifications. If we require any architectural clarification, we will reach out directly to you.

Warm regards,

Mayank Kumar
Founder & Principal Full-Stack Engineer
MayankZen Studios
Official Email: account@mayankzen.in
Website: https://mayankzen.in
New Delhi, India
  `.trim();

  let sentLive = false;
  let clientSent = false;
  let deliveryError = null;
  let unblockRequired = false;
  let messageId = null;

  try {
    const { transporter, error: connErr } = await getTransporter();
    if (transporter) {
      const clientInfo = await transporter.sendMail({
        from: `"MayankZen Studios" <${cfg.user}>`,
        to: cleanEmail,
        replyTo: cfg.notificationEmail || 'account@mayankzen.in',
        subject: subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-Sender-Account': cfg.user,
          'X-Tracking-ID': trackingId
        }
      });

      console.log(`[EmailService] Client confirmation email successfully sent to ${cleanEmail}: ${clientInfo.messageId}`);
      clientSent = true;
      sentLive = true;
      messageId = clientInfo.messageId;
    } else {
      deliveryError = connErr || 'No active SMTP transporter available';
    }
  } catch (err) {
    deliveryError = err.message;
    if (err.message.includes('Unusual sending activity detected') || err.message.includes('UnblockMe')) {
      unblockRequired = true;
    }
    console.error(`[EmailService] Error dispatching client confirmation email to ${cleanEmail}:`, err.message);
  }

  // Audit log
  logEmailDispatch({
    recipient: cleanEmail,
    clientName,
    service: serviceName,
    trackingId,
    status,
    sender: cfg.user,
    subject,
    sentLive,
    clientSent,
    type: 'client_confirmation',
    error: deliveryError,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    messageId,
    deliveredAt: new Date().toISOString()
  });

  return {
    success: sentLive,
    sentLive,
    clientSent,
    trackingId,
    recipient: cleanEmail,
    sender: cfg.user,
    status: sentLive ? 'sent' : (unblockRequired ? 'unblock_required' : 'logged_queued'),
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    messageId,
    error: deliveryError
  };
}

/**
 * Sends a formal status update email to the client when their project progresses.
 */
export async function sendStatusUpdateEmail(request, { newStatus, oldStatus, note } = {}) {
  const cleanEmail = (request?.email || '').trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, sentLive: false, message: 'No valid recipient email provided' };
  }

  const cfg = getSmtpConfig();
  const trackingId = request.trackingId || 'MS-PROJECT';
  const serviceName = request.service || 'Custom Development Service';
  const clientName = request.name || 'Valued Client';
  const currentStatus = newStatus || request.status || 'In Progress';
  const trackUrl = `https://mayankzen.in/track/?id=${encodeURIComponent(trackingId)}`;
  const subject = `Status Update [${trackingId}]: Now ${currentStatus} - ${serviceName} | MayankZen Studios`;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Status Update</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 35px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background: #131b2e; border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding: 30px 35px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid rgba(255,255,255,0.08);">
              <div style="display: inline-block; padding: 4px 12px; background: rgba(0, 240, 255, 0.15); border: 1px solid rgba(0, 240, 255, 0.4); border-radius: 999px; color: #00f0ff; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">
                Milestone Progress
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Project Status Update</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Tracking Reference: <strong style="color: #00f0ff;">${escapeHtml(trackingId)}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 35px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #e2e8f0;">Dear <strong>${escapeHtml(clientName)}</strong>,</p>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Your project <strong>${escapeHtml(serviceName)}</strong> has reached a new development milestone:
              </p>

              <table role="presentation" width="100%" style="background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #94a3b8; width: 35%;">New Status:</td>
                  <td style="padding: 6px 0; font-size: 14px; font-weight: 800; color: #34d399;">${escapeHtml(currentStatus)}</td>
                </tr>
                ${oldStatus ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">Previous Status:</td>
                  <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">${escapeHtml(oldStatus)}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #94a3b8;">Updated On:</td>
                  <td style="padding: 6px 0; font-size: 13px; color: #cbd5e1;">${escapeHtml(dateStr)}</td>
                </tr>
                ${note ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #94a3b8; vertical-align: top;">Engineering Note:</td>
                  <td style="padding: 6px 0; font-size: 13px; color: #e2e8f0; line-height: 1.5;">${escapeHtml(note)}</td>
                </tr>
                ` : ''}
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 25px;">
                <tr>
                  <td align="center">
                    <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: 13px 28px; background: linear-gradient(135deg, #00f0ff 0%, #0077ff 100%); color: #020617; text-decoration: none; font-weight: 800; font-size: 13px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 240, 255, 0.35);">
                      View Real-Time Progress &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.6;">
                You can review real-time deliverables and communicate directly with Mayank via the live project tracker link above.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  let sentLive = false;
  let deliveryError = null;
  let unblockRequired = false;
  let messageId = null;

  try {
    const { transporter, error: connErr } = await getTransporter();
    if (transporter) {
      const info = await transporter.sendMail({
        from: `"MayankZen Studios" <${cfg.user}>`,
        to: cleanEmail,
        replyTo: cfg.notificationEmail || 'account@mayankzen.in',
        subject,
        html: htmlContent,
        headers: {
          'X-Sender-Account': cfg.user,
          'X-Tracking-ID': trackingId
        }
      });
      sentLive = true;
      messageId = info.messageId;
    } else {
      deliveryError = connErr || 'No active SMTP transporter available';
    }
  } catch (err) {
    deliveryError = err.message;
    if (err.message.includes('Unusual sending activity detected') || err.message.includes('UnblockMe')) {
      unblockRequired = true;
    }
  }

  logEmailDispatch({
    recipient: cleanEmail,
    clientName,
    service: serviceName,
    trackingId,
    status: currentStatus,
    sender: cfg.user,
    subject,
    sentLive,
    type: 'status_update',
    error: deliveryError,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    messageId,
    deliveredAt: new Date().toISOString()
  });

  return {
    success: sentLive,
    sentLive,
    trackingId,
    recipient: cleanEmail,
    status: currentStatus,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    messageId,
    error: deliveryError
  };
}

/**
 * Dispatches all automated emails for a new project request submission concurrently:
 * 1. Admin Alert to notification recipient(s)
 * 2. Client Confirmation to client's email (if provided)
 */
export async function sendAllProjectSubmissionEmails(request) {
  if (!request) {
    return { success: false, sentLive: false, message: 'No request data provided' };
  }

  const trackingId = request.trackingId || ('MS-' + Math.floor(1000 + Math.random() * 9000));
  console.log(`[EmailService] Triggering submission emails for tracking ID: ${trackingId}`);

  const hasClientEmail = Boolean(request.email && typeof request.email === 'string' && request.email.trim().includes('@'));

  // Run admin alert and client confirmation concurrently via Promise.allSettled
  const [adminSettled, clientSettled] = await Promise.allSettled([
    sendNewProjectAdminAlertEmail(request),
    hasClientEmail ? sendServiceRequestConfirmationEmail(request) : Promise.resolve(null)
  ]);

  const adminAlert = adminSettled.status === 'fulfilled' ? adminSettled.value : {
    success: false,
    sentLive: false,
    error: adminSettled.reason?.message || 'Admin alert dispatch failed'
  };

  const clientConfirmation = clientSettled.status === 'fulfilled' ? clientSettled.value : {
    success: false,
    sentLive: false,
    error: clientSettled.reason?.message || 'Client confirmation dispatch failed'
  };

  const adminSent = Boolean(adminAlert?.sentLive);
  const clientSent = Boolean(clientConfirmation?.sentLive);
  const sentLive = adminSent || clientSent;
  const unblockRequired = Boolean(adminAlert?.unblockRequired || clientConfirmation?.unblockRequired);
  const error = (!sentLive) ? (clientConfirmation?.error || adminAlert?.error || null) : null;

  return {
    success: sentLive,
    sentLive,
    clientSent,
    adminSent,
    trackingId,
    recipient: request.email || null,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    error,
    adminAlert,
    clientConfirmation
  };
}

export function getEmailLogs() {
  try {
    if (fs.existsSync(EMAIL_LOGS_PATH)) {
      return JSON.parse(fs.readFileSync(EMAIL_LOGS_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
}
