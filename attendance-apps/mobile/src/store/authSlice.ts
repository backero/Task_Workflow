import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';

import * as authApi from '../api/auth';
import {clearTokens, getAccessToken, getRefreshToken, loadPersistedTokens, setTokens} from '../api/tokenStore';
import {locationService} from '../services/location/LocationService';

interface AuthState {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isBootstrapping: true,
};

export const bootstrap = createAsyncThunk<boolean>('auth/bootstrap', async () => {
  try {
    await loadPersistedTokens();
  } catch {
    // Unavailable/corrupted storage — proceed as logged-out rather than
    // leave the bootstrap spinner stuck forever.
  }
  return getAccessToken() !== null;
});

export const login = createAsyncThunk<void, {email: string; password: string}>(
  'auth/login',
  async ({email, password}) => {
    const tokens = await authApi.login(email, password);
    await setTokens(tokens);
  },
);

export const logout = createAsyncThunk<void>('auth/logout', async () => {
  // A FIELD employee logging out while a session is open must not leave
  // the local tracking timer running unattended — no-ops if none is open.
  try {
    await locationService.stopTracking();
  } catch {
    // Best-effort — local logout proceeds regardless.
  }
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // Best-effort server-side revocation — local logout proceeds
      // regardless so the user is never stuck signed in on this device.
    }
  }
  await clearTokens();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched from api/client.ts's 401-refresh-failure path, via
     * tokenStore's session-expired callback (see store/index.ts). */
    sessionExpired(state) {
      state.isAuthenticated = false;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(bootstrap.fulfilled, (state, action) => {
        state.isAuthenticated = action.payload;
        state.isBootstrapping = false;
      })
      .addCase(bootstrap.rejected, state => {
        state.isBootstrapping = false;
      })
      .addCase(login.fulfilled, state => {
        state.isAuthenticated = true;
      })
      .addCase(logout.fulfilled, state => {
        state.isAuthenticated = false;
      });
  },
});

export const {sessionExpired} = authSlice.actions;
export default authSlice.reducer;
