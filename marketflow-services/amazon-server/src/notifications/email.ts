import nodemailer from 'nodemailer'

// Alert channel per Design Doc §11 — email, configured via env vars so no secret
// lives in code. Silently no-ops until SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO
// are set, so the rules engine can call this unconditionally.
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO, ALERT_EMAIL_FROM } = process.env

const isConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL_TO)

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null

export type AlertForEmail = {
  title: string
  message: string
  suggestedAction: string
  severity: 'red' | 'amber'
}

export async function sendAlertEmail(alerts: AlertForEmail[]) {
  if (alerts.length === 0) return
  if (!transporter) {
    console.warn(`[email] SMTP not configured — skipping ${alerts.length} alert email(s). Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO in server/.env.`)
    return
  }

  const redCount = alerts.filter((a) => a.severity === 'red').length
  const amberCount = alerts.length - redCount
  const subject = `Robo: ${alerts.length} new alert${alerts.length > 1 ? 's' : ''} (${redCount} critical, ${amberCount} warning)`

  const text = alerts
    .map((a) => `[${a.severity.toUpperCase()}] ${a.title}\n${a.message}\nSuggested action: ${a.suggestedAction}\n`)
    .join('\n')

  const html = alerts
    .map(
      (a) => `
      <div style="margin-bottom:16px;padding:12px;border-left:4px solid ${a.severity === 'red' ? '#dc2626' : '#d97706'};background:#f9f9f9;">
        <div style="font-weight:600;color:${a.severity === 'red' ? '#dc2626' : '#d97706'};">${a.title}</div>
        <div style="margin:4px 0;">${a.message}</div>
        <div style="font-size:13px;color:#555;"><b>Suggested action:</b> ${a.suggestedAction}</div>
      </div>`,
    )
    .join('')

  try {
    await transporter.sendMail({
      from: ALERT_EMAIL_FROM ?? SMTP_USER,
      to: ALERT_EMAIL_TO,
      subject,
      text,
      html,
    })
  } catch (err) {
    console.error('[email] failed to send alert email:', err instanceof Error ? err.message : err)
  }
}
