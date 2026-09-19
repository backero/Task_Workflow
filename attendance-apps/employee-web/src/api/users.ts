import type {CurrentUser} from '../types/models';
import {apiRequest} from './httpClient';
import {mapCurrentUser} from './nodeAdapters';

interface NodeMeResponse {
  user: {_id: string; email: string; role: string; permissions?: string[]};
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const res = await apiRequest<NodeMeResponse>({url: '/auth/me'});
  return mapCurrentUser(res.user);
}
