/**
 * Thin proxy to amazon-server (marketflow-services/amazon-server) — the one
 * marketplace-automation backend still reachable over HTTP. Meesho/Snapdeal/
 * Flipkart no longer run HTTP servers (see python-service/) and are read
 * from MongoDB directly in marketflow.routes.js instead.
 *
 * amazon-server runs under pm2 alongside this backend (loopback-only), so
 * no API key/Basic Auth is needed here, unlike socialEngine.service.js's
 * external engine.
 */
const axios  = require('axios');
const logger = require('../utils/logger');

const { MARKETFLOW_AMAZON_PORT = 4000 } = process.env;

const v1Client = axios.create({ baseURL: `http://127.0.0.1:${MARKETFLOW_AMAZON_PORT}/v1`, timeout: 20000 });

const forward = async (target, method, path, { params, data } = {}) => {
  if (target !== 'v1') throw Object.assign(new Error(`Unknown marketflow target: ${target}`), { status: 500 });
  try {
    const res = await v1Client.request({ method, url: path, params, data });
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
