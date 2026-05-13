/**
 * Baileys auth state backed by MongoDB.
 * Used in production so the WhatsApp session survives server restarts.
 */
const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const WaSession = require('../models/WaSession');

const useMongoAuthState = async (sessionId = 'default') => {
  const read = async (key) => {
    const doc = await WaSession.findById(`${sessionId}:${key}`).lean();
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
  };

  const write = async (key, value) => {
    const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await WaSession.findByIdAndUpdate(
      `${sessionId}:${key}`,
      { data },
      { upsert: true, new: true }
    );
  };

  const del = async (key) => {
    await WaSession.findByIdAndDelete(`${sessionId}:${key}`);
  };

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            })
          );
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              tasks.push(value ? write(`${category}-${id}`, value) : del(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clearSession: async () => {
      await WaSession.deleteMany({ _id: new RegExp(`^${sessionId}:`) });
    },
  };
};

module.exports = { useMongoAuthState };
