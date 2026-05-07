const logger = require('../utils/logger');
const emailService = require('../services/email.service');

class MockQueue {
  constructor(name) {
    this.name = name;
  }

  async add(jobName, data, opts = {}) {
    logger.debug(`[Queue:${this.name}] Job "${jobName}" queued | data: ${JSON.stringify(data)}`);
    const handler = mockHandlers[this.name]?.[jobName];
    if (handler) {
      try { await handler(data); } catch (err) { logger.error(`[Queue:${this.name}] Job "${jobName}" failed: ${err.message}`); }
    }
    return { id: `mock-${Date.now()}` };
  }
}

const mockHandlers = {
  notifications: {
    send_push: async (data) => {
      logger.info(`[Push] → user:${data.userId} | ${data.title}: ${data.message}`);
    },
  },
  emails: {
    send_email: async (data) => {
      await emailService.send({ to: data.to, subject: data.subject, text: data.body });
    },
    send_otp_email: async (data) => {
      await emailService.sendOtpEmail(data.to, data.otp);
    },
  },
  reports: {
    generate_report: async (data) => {
      logger.info(`[Report] Generating ${data.type} report for org:${data.orgId}`);
    },
  },
};

const notificationQueue = new MockQueue('notifications');
const emailQueue        = new MockQueue('emails');
const reportQueue       = new MockQueue('reports');

const queueNotification = (userId, title, message, meta = {}) =>
  notificationQueue.add('send_push', { userId, title, message, ...meta });

const queueEmail = (to, subject, body, meta = {}) =>
  emailQueue.add('send_email', { to, subject, body, ...meta });

const queueReport = (orgId, type, params = {}) =>
  reportQueue.add('generate_report', { orgId, type, params });

module.exports = { notificationQueue, emailQueue, reportQueue, queueNotification, queueEmail, queueReport };
