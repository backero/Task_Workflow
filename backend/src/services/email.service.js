const nodemailer = require('nodemailer')
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NODE_ENV } = require('../config/env')
const logger = require('../utils/logger')

let transporter

if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
} else {
  // Console fallback for dev
  transporter = {
    sendMail: async (opts) => {
      logger.info(`[EMAIL] To: ${opts.to} | Subject: ${opts.subject}\n${opts.text || ''}`)
      return { messageId: 'mock-' + Date.now() }
    },
  }
}

const send = async ({ to, subject, text, html }) => {
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM || 'noreply@backero.in',
      to,
      subject,
      text,
      html,
    })
    logger.info(`Email sent to ${to}: ${info.messageId}`)
    return info
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`)
  }
}

const sendTaskAssigned = (user, task) =>
  send({
    to: user.email,
    subject: `Task assigned: ${task.title}`,
    text: `Hi ${user.name || 'there'},\n\nYou have been assigned a new task: "${task.title}".\n\nLog in to view details.`,
  })

const sendOtpEmail = (email, otp) =>
  send({
    to: email,
    subject: 'Your OTP for Backero',
    text: `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this with anyone.`,
  })

module.exports = { send, sendTaskAssigned, sendOtpEmail }
