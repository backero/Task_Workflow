// Biometric device registry + sync — ported from the Attendance Tracker's
// app/modules/biometric/router.py + service.py. Device-specific protocol
// code never lives here — everything past ingestion is vendor-agnostic
// (see services/attendanceIngest.service.js). Only CSV_IMPORT is a real,
// working "adapter" in this port (see csvImportAdapter.service.js) — every
// other vendor string is accepted for registration (matches the source,
// which also has no real ZKTeco/Suprema/etc. adapter yet, "blocked on a
// vendor decision") but `sync` for them always reports 0 events, since
// there's no live device connection to pull from.
const BiometricDevice = require('../models/BiometricDevice');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { recordAuditEvent } = require('../services/attendanceAudit.service');
const csvAdapter = require('../services/csvImportAdapter.service');
const { ingestEvent } = require('../services/attendanceIngest.service');

const CSV_IMPORT_VENDOR = 'CSV_IMPORT';

exports.list = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { page = 1, limit = 20 } = req.query;
  const total = await BiometricDevice.countDocuments({ organizationId: orgId });
  const { skip, limit: lim } = paginate(page, limit);
  const rows = await BiometricDevice.find({ organizationId: orgId }).sort({ name: 1 }).skip(skip).limit(lim);
  sendSuccess(res, paginateResponse(rows, total, page, limit));
});

exports.create = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { name, vendor, location_label: locationLabel, connection_secret_ref: connectionSecretRef } = req.body;
  if (!name) return sendError(res, 'name is required.', 422);

  const device = await BiometricDevice.create({
    organizationId: orgId,
    name,
    vendor: vendor || 'MOCK',
    locationLabel: locationLabel || null,
    connectionSecretRef: connectionSecretRef || null,
    status: 'UNKNOWN',
    createdBy: req.user._id,
  });

  await recordAuditEvent({
    organizationId: orgId, actorUserId: req.user._id, action: 'device.create',
    entityType: 'BiometricDevice', entityId: device._id, newValue: { name, vendor: device.vendor },
  });
  sendSuccess(res, { device }, 'Device created', 201);
});

exports.setImportConfig = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const device = await BiometricDevice.findOne({ _id: req.params.deviceId, organizationId: orgId });
  if (!device) return sendError(res, 'Biometric device not found.', 404);
  if (device.vendor !== CSV_IMPORT_VENDOR) {
    return sendError(res, `Only devices with vendor '${CSV_IMPORT_VENDOR}' accept an import configuration.`, 422);
  }

  const config = csvAdapter.parseImportConfig(req.body); // validates before persisting
  device.importConfig = req.body;
  await device.save();

  await recordAuditEvent({
    organizationId: orgId, actorUserId: req.user._id, action: 'device.import_config_set',
    entityType: 'BiometricDevice', entityId: device._id, newValue: config,
  });
  sendSuccess(res, { device }, 'Import config updated');
});

async function ingestRawEvents(req, orgId, device, rawEvents) {
  const io = req.app.get('io');
  const source = device.vendor === 'MOCK' ? 'MOCK' : 'DEVICE';
  let ingested = 0;
  let matched = 0;
  let unmatched = 0;
  for (const raw of rawEvents) {
    const dedupeKey = `${device._id}:${raw.deviceEmployeeRef}:${raw.eventTimestamp.toISOString()}`;
    // eslint-disable-next-line no-await-in-loop
    const { event, wasNewlyInserted } = await ingestEvent(orgId, {
      deviceId: device._id,
      deviceEmployeeRef: raw.deviceEmployeeRef,
      eventType: raw.eventType,
      eventTimestamp: raw.eventTimestamp,
      rawEvent: raw.rawPayload,
      source,
      dedupeKey,
    }, { io });
    if (wasNewlyInserted) {
      ingested += 1;
      if (event.employeeId) matched += 1;
      else unmatched += 1;
    }
  }
  return { ingested, matched, unmatched };
}

exports.sync = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const device = await BiometricDevice.findOne({ _id: req.params.deviceId, organizationId: orgId });
  if (!device) return sendError(res, 'Biometric device not found.', 404);

  // No real vendor adapter exists yet for any non-CSV vendor (same gap the
  // source has — "blocked on a vendor decision"). CSV_IMPORT devices sync
  // via file upload (exports.importFile), not this live-pull endpoint.
  device.status = 'UNKNOWN';
  device.lastSeenAt = new Date();
  await device.save();

  const { ingested, matched, unmatched } = await ingestRawEvents(req, orgId, device, []);
  sendSuccess(res, { events_ingested: ingested, events_matched: matched, events_unmatched: unmatched });
});

exports.importFile = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const device = await BiometricDevice.findOne({ _id: req.params.deviceId, organizationId: orgId });
  if (!device) return sendError(res, 'Biometric device not found.', 404);
  if (device.vendor !== CSV_IMPORT_VENDOR) {
    return sendError(res, `Only devices with vendor '${CSV_IMPORT_VENDOR}' accept a file import.`, 422);
  }
  if (!device.importConfig) {
    return sendError(res, 'This device has no column mapping configured yet. Configure it before importing a file.', 422);
  }
  if (!req.file) return sendError(res, 'A file is required.', 422);

  const config = csvAdapter.parseImportConfig(device.importConfig);
  const rawEvents = csvAdapter.loadCsv(config, req.file.buffer);

  device.status = 'ONLINE';
  device.lastSeenAt = new Date();
  await device.save();

  const { ingested, matched, unmatched } = await ingestRawEvents(req, orgId, device, rawEvents);
  sendSuccess(res, { events_ingested: ingested, events_matched: matched, events_unmatched: unmatched });
});
