/**
 * Thin proxy to the 4 marketplace-automation backend services (amazon/server,
 * Meesho, Snapdeal, Flipkart) — monitoring/recommendation dashboards for the
 * Treyfa/Kumarie marketplace listings, ported into Task_Workflow as the
 * "Marketflow" section. These services were migrated to run under pm2
 * alongside this backend (see ops notes in the Marketflow plan) rather than
 * staying on a separate droplet target, so calls here are loopback-only —
 * no API key/Basic Auth needed, unlike socialEngine.service.js's external
 * engine.
 */
const axios  = require('axios');
const logger = require('../utils/logger');

const {
  MARKETFLOW_AMAZON_PORT = 4000,
  MARKETFLOW_MEESHO_PORT = 8010,
  MARKETFLOW_SNAPDEAL_PORT = 8300,
  MARKETFLOW_FLIPKART_PORT = 8600,
} = process.env;

const makeClient = (port, basePath = '') =>
  axios.create({ baseURL: `http://127.0.0.1:${port}${basePath}`, timeout: 20000 });

// amazon/server mounts its routes at /v1/*; Meesho/Snapdeal/Flipkart mount
// theirs at /api/* on their own port (nginx rewrites /api/<platform>/ -> /api/
// in production — replicate that same rewrite here via basePath).
const clients = {
  v1:       makeClient(MARKETFLOW_AMAZON_PORT, '/v1'),
  meesho:   makeClient(MARKETFLOW_MEESHO_PORT, '/api'),
  snapdeal: makeClient(MARKETFLOW_SNAPDEAL_PORT, '/api'),
  flipkart: makeClient(MARKETFLOW_FLIPKART_PORT, '/api'),
};

const forward = async (target, method, path, { params, data } = {}) => {
  const client = clients[target];
  if (!client) throw Object.assign(new Error(`Unknown marketflow target: ${target}`), { status: 500 });
  try {
    const res = await client.request({ method, url: path, params, data });
    return { status: res.status, data: res.data };
  } catch (e) {
    const status = e.response?.status;
    const detail = e.response?.data?.detail || e.response?.data?.error || e.message;
    logger.error(`marketflow.${target}.forward.failed method=${method} path=${path} status=${status} error=${detail}`);
    const err = new Error(detail);
    err.status = status && status >= 400 && status < 500 ? status : 502;
    throw err;
  }
};

module.exports = { forward };
