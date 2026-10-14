import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';

import * as authApi from '../api/auth';
import {getMyEmployeeProfile} from '../api/employees';
import {clearTokens, getAccessToken, getRefreshToken, loadPersistedTokens, setTokens} from '../api/tokenStore';
import {getCurrentUser} from '../api/users';
import type {CurrentUser, Employee} from '../types/models';

interface AuthState {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  currentUser: CurrentUser | null;
  employee: Employee | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isBootstrapping: true,
  currentUser: null,
  employee: null,
};

interface Profile {
  currentUser: CurrentUser;
  employee: Employee | null;
}

async function loadProfile(): Promise<Profile> {
  const currentUser = await getCurrentUser();
  // A user account may not yet be linked to an Employee record (backend
  // returns 404 for GET /employees/me in that case) — treat that as a
  // legitimate, displayable state rather than a hard failure.
  const employee = await getMyEmployeeProfile().catch(() => null);
  return {currentUser, employee};
}

export const bootstrap = createAsyncThunk<Profile | null>('auth/bootstrap', async () => {
  loadPersistedTokens();
  if (!getAccessToken()) {
    return null;
  }
  try {
    return await loadProfile();
  } catch {
    clearTokens();
    return null;
  }
});

export const login = createAsyncThunk<Profile, {email: string; password: string}>(
  'auth/login',
  async ({email, password}) => {
    const tokens = await authApi.login(email, password);
    setTokens(tokens);
    try {
      return await loadProfile();
    } catch {
      clearTokens();
      throw new Error('Signed in, but could not load your profile.');
    }
  },
);

export const logout = createAsyncThunk<void>('auth/logout', async () => {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // Best-effort server-side revocation — local logout proceeds regardless.
    }
  }
  clearTokens();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched from the Axios response interceptor (httpClient.ts) on a
     * 401-refresh failure, via tokenStore's session-expired callback. */
    sessionExpired(state) {
      state.isAuthenticated = false;
      state.currentUser = null;
      state.employee = null;
    },
    /** Dispatched after a successful PATCH /employees/me so the profile
     * page reflects the change immediately without a full re-bootstrap. */
    employeeUpdated(state, action: {payload: Employee}) {
      state.employee = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(bootstrap.fulfilled, (state, action) => {
        state.currentUser = action.payload?.currentUser ?? null;
        state.employee = action.payload?.employee ?? null;
        state.isAuthenticated = action.payload !== null;
        state.isBootstrapping = false;
      })
      .addCase(bootstrap.rejected, state => {
        state.isBootstrapping = false;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.currentUser = action.payload.currentUser;
        state.employee = action.payload.employee;
        state.isAuthenticated = true;
      })
      .addCase(logout.fulfilled, state => {
        state.isAuthenticated = false;
        state.currentUser = null;
        state.employee = null;
      });
  },
});

export const {sessionExpired, employeeUpdated} = authSlice.actions;
export default authSlice.reducer;
