import {useCallback} from 'react';

import {useAppDispatch, useAppSelector} from '../store/hooks';
import {login as loginThunk, logout as logoutThunk} from '../store/authSlice';

export function useAuth() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const isBootstrapping = useAppSelector(state => state.auth.isBootstrapping);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      await dispatch(loginThunk({email, password})).unwrap();
    },
    [dispatch],
  );

  const logout = useCallback(async (): Promise<void> => {
    await dispatch(logoutThunk()).unwrap();
  }, [dispatch]);

  return {isAuthenticated, isBootstrapping, login, logout};
}
