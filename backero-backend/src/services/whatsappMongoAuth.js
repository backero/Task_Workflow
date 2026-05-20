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

const useMongoAuthState = async () => {
  await waitForMongoose();

  const writeData = async (key, data) => {
    await WASession.findByIdAndUpdate(key, { data }, { upsert: true });
  };

  const readData = async (key) => {
    const doc = await WASession.findById(key).lean();
    return doc?.data ?? null;
  };

  const removeData = async (key) => {
    await WASession.deleteOne({ _id: key });
  };

  const creds = await readData('creds') || {};

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

module.exports = { useMongoAuthState };
