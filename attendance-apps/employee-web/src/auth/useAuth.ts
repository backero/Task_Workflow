import {useCallback} from 'react';

import type {Employee} from '../types/models';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {employeeUpdated, login as loginThunk, logout as logoutThunk} from '../store/authSlice';

export function useAuth() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const isBootstrapping = useAppSelector(state => state.auth.isBootstrapping);
  const currentUser = useAppSelector(state => state.auth.currentUser);
  const employee = useAppSelector(state => state.auth.employee);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      await dispatch(loginThunk({email, password})).unwrap();
    },
    [dispatch],
  );

  const logout = useCallback(async (): Promise<void> => {
    await dispatch(logoutThunk()).unwrap();
  }, [dispatch]);

  const setEmployee = useCallback(
    (next: Employee): void => {
      dispatch(employeeUpdated(next));
    },
    [dispatch],
  );

  return {isAuthenticated, isBootstrapping, currentUser, employee, login, logout, setEmployee};
}
