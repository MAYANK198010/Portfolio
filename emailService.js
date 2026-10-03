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
    // Keep last 100 emails
    if (logs.length > 100) logs = logs.slice(0, 100);
    fs.writeFileSync(EMAIL_LOGS_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[EmailService] Failed to log email record:', err);
  }
}

/**
 * Sends a formal confirmation email to the client upon service request submission.
 * From: account@mayankzen.in
 */
export async function sendServiceRequestConfirmationEmail(request) {
  if (!request || !request.email) {
    console.warn('[EmailService] Skipped sending confirmation email: No recipient email provided.');
    return { success: false, message: 'No recipient email provided' };
  }

  const trackingId = request.trackingId || 'MS-PENDING';
  const serviceName = request.service || 'Custom Development Service';
  const clientName = request.name || 'Valued Client';
  const status = request.status || 'Pending';
  const budget = request.budget ? `$${request.budget}` : 'Custom Scope';
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
  `;

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

  // Zoho India accounts require smtp.zoho.in. Attempt host failover for maximum reliability.
  const envHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || process.env.EMAIL_USER || 'accounts@mayankzen.in').trim();
  const smtpPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const smtpPort = Number(process.env.SMTP_PORT) || 465;

  const candidateHosts = [];
  if (envHost && !envHost.includes('zoho')) {
    candidateHosts.push(envHost);
  }
  // Zoho India accounts (.in domains) must connect to smtp.zoho.in
  candidateHosts.push('smtp.zoho.in', 'smtppro.zoho.in', 'smtp.zoho.com', 'smtppro.zoho.com');

  let sentLive = false;
  let clientSent = false;
  let deliveryError = null;
  let unblockRequired = false;
  let activeTransporter = null;

  if (smtpUser && smtpPass) {
    for (const host of candidateHosts) {
      try {
        const port = host.includes('zoho') ? 465 : smtpPort;
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          },
          tls: {
            rejectUnauthorized: false
          },
          connectionTimeout: 8000,
          greetingTimeout: 8000
        });

        // Test transporter connection
        await transporter.verify();
        activeTransporter = transporter;
        console.log(`[EmailService] Connected successfully to SMTP host: ${host}:${port} as ${smtpUser}`);
        break;
      } catch (connErr) {
        console.warn(`[EmailService] Host ${host} connection failed: ${connErr.message}`);
      }
    }

    if (activeTransporter) {
      // 1. Send client confirmation email (with automatic single retry on transient error)
      try {
        const clientInfo = await activeTransporter.sendMail({
          from: `"MayankZen Studios" <${smtpUser}>`,
          to: request.email,
          replyTo: 'account@mayankzen.in',
          subject: subject,
          text: textContent,
          html: htmlContent,
          headers: {
            'X-Sender-Account': 'account@mayankzen.in',
            'X-Tracking-ID': trackingId
          }
        });

        console.log(`[EmailService] Client confirmation email successfully sent to ${request.email}: ${clientInfo.messageId}`);
        clientSent = true;
        sentLive = true;
      } catch (err) {
        console.warn(`[EmailService] Client initial delivery attempt for ${request.email}: ${err.message}`);
        
        // Single retry after brief delay if not a permanent policy rejection
        if (!err.message.includes('Unusual sending activity') && !err.message.includes('Sender is not allowed')) {
          try {
            await new Promise(r => setTimeout(r, 1200));
            const retryInfo = await activeTransporter.sendMail({
              from: `"MayankZen Studios" <${smtpUser}>`,
              to: request.email,
              replyTo: 'account@mayankzen.in',
              subject: subject,
              text: textContent,
              html: htmlContent
            });
            console.log(`[EmailService] Client confirmation retry succeeded for ${request.email}: ${retryInfo.messageId}`);
            clientSent = true;
            sentLive = true;
          } catch (retryErr) {
            console.warn(`[EmailService] Client confirmation retry notice for ${request.email}: ${retryErr.message}`);
            deliveryError = retryErr.message;
          }
        } else {
          deliveryError = err.message;
          if (err.message.includes('Unusual sending activity detected')) {
            unblockRequired = true;
          }
        }
      }
    } else {
      deliveryError = 'Could not establish connection to any SMTP host';
    }
  } else {
    console.log(`[EmailService] SMTP credentials not set in environment. Email confirmation logged & queued for ${request.email} from account@mayankzen.in`);
    deliveryError = 'SMTP credentials not configured in environment';
  }

  // Always log the email record so it's audit-tracked in the system
  logEmailDispatch({
    recipient: request.email,
    clientName,
    service: serviceName,
    trackingId,
    status,
    sender: 'account@mayankzen.in',
    subject,
    sentLive,
    clientSent,
    error: deliveryError,
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    deliveredAt: new Date().toISOString()
  });

  return {
    success: true,
    sentLive,
    clientSent,
    trackingId,
    recipient: request.email,
    sender: 'account@mayankzen.in',
    status: sentLive ? 'sent' : (unblockRequired ? 'unblock_required' : 'logged_queued'),
    unblockRequired,
    unblockUrl: unblockRequired ? 'https://mail.zoho.in/UnblockMe' : null,
    error: deliveryError
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
