import nodemailer from 'nodemailer';

/**
 * Sends the 6-digit login code. ONE provider behind ONE function: swapping the
 * provider means editing this file and nothing else.
 *
 * Provider: SMTP (Amazon SES SMTP interface today). Env:
 *   SMTP_HOST, SMTP_PORT (587 = STARTTLS), SMTP_USER, SMTP_PASS
 *   EMAIL_FROM   e.g. "WorldGuessr <noreply@worldguessr.com>"
 * The sending domain needs SPF, DKIM and DMARC at DNS and must be a verified
 * SES identity, or the codes land in spam or are refused outright.
 *
 * Dev: with no EMAIL_FROM outside production the code is printed to the auth
 * server console instead of being mailed, so the flow is testable locally.
 * Production never prints a code.
 */
export const LOGIN_CODE_TTL_MINUTES = 10;

let transport = null;
function smtp() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

const SITE = 'worldguessr.com';
const BRAND_GREEN = '#245734';

function textBody(code) {
  return [
    'WorldGuessr',
    '',
    `Your code is ${code}`,
    '',
    `It works for ${LOGIN_CODE_TTL_MINUTES} minutes. Type it into WorldGuessr to finish signing in.`,
    '',
    'If you did not ask for this code, you can ignore this email. Nobody can sign in without it.',
    '',
    `WorldGuessr · https://www.${SITE}`,
  ].join('\n');
}

// One centred card, system fonts (mail clients have no Lexend), no images
// (school filters strip them, and text-only mail scores better with filters).
// Table layout because Outlook still needs it.
function htmlBody(code) {
  const digits = String(code).split('').join('&#8202;'); // hair spaces keep the digits readable and copyable
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Your WorldGuessr code</title>
<!-- The brand text face. Apple Mail / iOS Mail / Samsung Mail load it;
     Gmail and Outlook ignore web fonts and fall back to the system stack. -->
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap');
  .wg-lexend { font-family: 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#f2f4f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your WorldGuessr code is ${code}. It works for ${LOGIN_CODE_TTL_MINUTES} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f3;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#ffffff;border-radius:16px;">
        <tr>
          <td style="padding:32px 32px 8px;font-family:'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div class="wg-lexend" style="font-family:'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1;color:${BRAND_GREEN};letter-spacing:-0.2px;">WorldGuessr</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;font-family:'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
            <div style="font-size:22px;font-weight:700;line-height:1.3;">Your code</div>
            <div style="font-size:15px;line-height:1.5;color:#4b5563;margin-top:6px;">Type it into WorldGuessr to finish signing in.</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 8px;">
            <div style="display:inline-block;padding:18px 28px;background:#f2f4f3;border-radius:12px;font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;font-weight:700;letter-spacing:6px;color:#111827;">${digits}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;font-family:'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#4b5563;font-size:14px;line-height:1.55;">
            It works for ${LOGIN_CODE_TTL_MINUTES} minutes.<br>
            If you didn't request this, you can safely ignore this email.
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
        <tr>
          <td style="padding:18px 8px 0;font-family:'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
            CoderGautam LLC &middot; <a href="https://www.${SITE}" style="color:#9ca3af;text-decoration:underline;">www.${SITE}</a><br>
            You received this because someone entered this email address to sign in to WorldGuessr.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendLoginCode({ to, code }) {
  const from = process.env.EMAIL_FROM;
  if (!from || !process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[sendLoginCode] EMAIL_FROM / SMTP_* are not set; login codes cannot be sent');
      return { ok: false, error: 'notConfigured' };
    }
    console.log('[sendLoginCode] DEV code for %s = %s', to, code);
    return { ok: true, dev: true };
  }

  try {
    const info = await smtp().sendMail({
      from,
      to,
      // Code first so it shows in the notification preview.
      subject: `${code} is your WorldGuessr code`,
      text: textBody(code),
      html: htmlBody(code),
      headers: {
        'X-Entity-Ref-ID': `wg-login-${Date.now()}`, // stops Gmail threading every code into one conversation
        'Auto-Submitted': 'auto-generated',
      },
    });
    return { ok: true, id: info?.messageId };
  } catch (e) {
    console.error('[sendLoginCode] SMTP send failed:', e?.code, e?.message);
    return { ok: false, error: 'sendFailed' };
  }
}
