import {configureStore} from '@reduxjs/toolkit';

import {setSessionExpiredHandler} from '../api/tokenStore';
import {apiSlice} from './apiSlice';
import authReducer, {bootstrap, sessionExpired} from './authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(apiSlice.middleware),
});

setSessionExpiredHandler(() => store.dispatch(sessionExpired()));
void store.dispatch(bootstrap());

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
