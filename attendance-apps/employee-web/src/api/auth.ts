import type {TokenPair} from '../types/models';
import {apiRequest} from './httpClient';

interface NodeLoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const res = await apiRequest<NodeLoginResponse>({url: '/auth/login', method: 'POST', data: {email, password}});
  return {access_token: res.accessToken, refresh_token: res.refreshToken, token_type: 'Bearer', expires_in: 0};
}

export function logout(_refreshToken: string): Promise<void> {
  // Node's /auth/logout resolves the session from the bearer access token
  // (authenticate middleware) and doesn't read the request body.
  return apiRequest<void>({url: '/auth/logout', method: 'POST'});
}
