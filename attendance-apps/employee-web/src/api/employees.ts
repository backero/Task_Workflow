import type {Employee} from '../types/models';
import {apiRequest} from './httpClient';
import {mapEmployee} from './nodeAdapters';

interface NodeEmployeeResponse {
  employee: Parameters<typeof mapEmployee>[0];
}

export async function getMyEmployeeProfile(): Promise<Employee> {
  const res = await apiRequest<NodeEmployeeResponse>({url: '/employees/me'});
  return mapEmployee(res.employee);
}

// Deliberately narrower than the admin side's PATCH /employees/{id} — an
// employee may only self-edit their own contact info (phone), matching the
// backend's self-update permission model.
export async function updateMyEmployeeProfile(updates: {phone: string | null}): Promise<Employee> {
  const res = await apiRequest<NodeEmployeeResponse>({url: '/employees/me', method: 'PATCH', data: updates});
  return mapEmployee(res.employee);
}

export async function uploadMyPhoto(file: File): Promise<Employee> {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await apiRequest<NodeEmployeeResponse>({
    url: '/employees/me/photo',
    method: 'POST',
    data: formData,
    headers: {'Content-Type': 'multipart/form-data'},
  });
  return mapEmployee(res.employee);
}
