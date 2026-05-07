const mongoose = require('mongoose')

const timeLogSchema = new mongoose.Schema(
  {
    taskId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Task',         required: true, index: true },
    projectId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Project',      required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true },
    minutes:        { type: Number, required: true, min: 1, max: 1440 },
    note:           { type: String, trim: true, maxlength: 200 },
    date:           { type: Date, default: Date.now },
  },
  { timestamps: true }
)

module.exports = mongoose.model('TimeLog', timeLogSchema)
