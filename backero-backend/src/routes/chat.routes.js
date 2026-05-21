const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');

router.use(authenticate, orgIsolation);

const SYSTEM_PROMPT = `You are Backero's in-app assistant. Backero is an enterprise multi-department workflow and CRM platform.

Help users navigate and use the platform efficiently. The platform has these main sections:
- Dashboard: Overview of metrics, tasks, and activity across departments
- Tasks: Create, assign, approve, and track tasks with multi-step approval workflows
- CRM: Manage leads, contacts, follow-ups, and the sales pipeline
- Inventory: Track stock levels, categories, suppliers, and purchase orders
- Production: Manage production orders, schedules, and output tracking
- Finance: Invoices, expenses, budgets, and financial reporting
- Marketing: Campaign management, content calendar, and performance tracking
- Marketplace: Platform task plans (Swiggy, Zomato, Blinkit, etc.) with weekly schedules and HTML template import
- Departments: Department-specific hubs with task columns and team member management
- Workflow: Visual workflow graphs showing task dependencies and status
- Reports: Daily/weekly PDF and Excel reports with multi-department summaries
- Notifications: Real-time alerts for task updates, approvals, and system events
- Settings: Organization settings, user management, WhatsApp integration, and preferences
- WhatsApp: Automated WhatsApp notifications via Baileys integration

Guidelines:
- Be concise and practical — users want quick answers while working
- If a user is on a specific page, give context-aware advice for that page
- For navigation questions, give exact menu paths (e.g. "Go to Settings → WhatsApp")
- Never make up features that don't exist
- Keep responses short and to the point`;

router.post('/chat', async (req, res) => {
  const { message, currentPage, history = [] } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT + (currentPage ? `\n\nThe user is currently on: ${currentPage}` : ''),
      },
      ...history.slice(-10).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: message.trim() },
    ];

    const stream = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 1024,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat route error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'AI service error' });
    }
    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    res.end();
  }
});

module.exports = router;
