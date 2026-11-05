const mongoose = require('mongoose');

// Store Baileys auth credentials in MongoDB so sessions survive Render restarts
const sessionSchema = new mongoose.Schema({
  _id: { type: String },
  data: { type: mongoose.Schema.Types.Mixed },
}, { collection: 'wa_sessions' });

const WASession = mongoose.models.WASession || mongoose.model('WASession', sessionSchema);

// Wait for mongoose to be connected before querying — connectDB() is not awaited in server.js
const waitForMongoose = () => new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) return resolve();
  const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout after 30s')), 30000);
  mongoose.connection.once('connected', () => { clearTimeout(timeout); resolve(); });
  mongoose.connection.once('error', (err) => { clearTimeout(timeout); reject(err); });
});

// sessionId namespaces the stored keys so multiple independent Baileys sessions
// (e.g. the notification bot and a separate CRO-number sync) can share this same
// collection without colliding. Omit it (or pass 'default') for the original,
// unprefixed behavior — existing sessions keep working unchanged.
const useMongoAuthState = async (baileys, sessionId = 'default') => {
  await waitForMongoose();

  const { initAuthCreds, BufferJSON } = baileys;
  const prefix = sessionId && sessionId !== 'default' ? `${sessionId}:` : '';

  const writeData = async (key, data) => {
    const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
    await WASession.findByIdAndUpdate(`${prefix}${key}`, { data: serialized }, { upsert: true });
  };

  const readData = async (key) => {
    const doc = await WASession.findById(`${prefix}${key}`).lean();
    if (!doc?.data) return null;
    return JSON.parse(JSON.stringify(doc.data), BufferJSON.reviver);
  };

  const removeData = async (key) => {
    await WASession.deleteOne({ _id: `${prefix}${key}` });
  };

  // Use initAuthCreds() on first run so Baileys has properly initialized noise/curve keys
  const creds = await readData('creds') || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          const val = await readData(`key_${type}_${id}`);
          if (val) data[id] = val;
        }
        return data;
      },
      set: async (data) => {
        for (const [type, typeData] of Object.entries(data)) {
          for (const [id, val] of Object.entries(typeData || {})) {
            if (val) {
              await writeData(`key_${type}_${id}`, val);
            } else {
              await removeData(`key_${type}_${id}`);
            }
          }
        }
      },
    },
  };

  const saveCreds = async () => {
    await writeData('creds', state.creds);
  };

  return { state, saveCreds };
};

const clearMongoSession = async (sessionId = 'default') => {
  await waitForMongoose();
  if (sessionId && sessionId !== 'default') {
    const escaped = sessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await WASession.deleteMany({ _id: { $regex: `^${escaped}:` } });
  } else {
    // Default (unprefixed) session — only remove keys that don't belong to a
    // namespaced session, so clearing this one never wipes another sessionId.
    await WASession.deleteMany({ _id: { $not: /:/ } });
  }
};

module.exports = { useMongoAuthState, clearMongoSession };
