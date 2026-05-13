const mongoose = require('mongoose')

const labelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    color: { type: String, default: '#6366f1' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

labelSchema.index({ organizationId: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Label', labelSchema)
