/**
 * Runtime configuration. `API_BASE_URL` is not a secret, so a plain
 * constant (rather than react-native-config/native env plumbing) is
 * sufficient here — the Android emulator reaches the host machine's
 * `localhost` via the special `10.0.2.2` alias. Override for a real device
 * or a staging/prod build by editing this file per-environment as part of
 * the release process (see docs/runbooks/deploy.md); `SENTRY_DSN` is
 * likewise not a bearer credential (DSNs are meant to be embedded in
 * client apps) but is left empty by default so crash reporting is a safe
 * no-op until a project DSN is provided at build time.
 *
 * Points at Task_Workflow's Node/Express + MongoDB Atlas backend
 * (backero-backend), not this repo's own Python backend/ — the latter is
 * being retired, all backend work happens on the Node side going forward.
 * Response-shape differences (envelope, camelCase fields) are absorbed by
 * api/nodeAdapters.ts, not by the screens.
 */
import {Platform} from 'react-native';

export const API_BASE_URL = __DEV__
  ? Platform.select({android: 'http://10.0.2.2:5000', default: 'http://localhost:5000'})
  : 'https://backero-backend.onrender.com';

export const API_V1_PREFIX = '/api';

export const SENTRY_DSN = '';
