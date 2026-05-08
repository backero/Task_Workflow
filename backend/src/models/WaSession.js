const mongoose = require('mongoose');

const waSessionSchema = new mongoose.Schema({
  _id:  { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

module.exports = mongoose.model('WaSession', waSessionSchema);
