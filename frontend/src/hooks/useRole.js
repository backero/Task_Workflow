import { useAuth } from '../context/AuthContext'

export const ROLE_HIERARCHY = {
  SUPER_ADMIN: 6,
  ORG_ADMIN:   5,
  ADMIN:       4,
  HR:          3,
  MANAGER:     2,
  EMPLOYEE:    1,
}

export const useRole = () => {
  const { user } = useAuth()
  const role  = user?.role || 'EMPLOYEE'
  const level = ROLE_HIERARCHY[role] || 1

  const atLeast = (minRole) => level >= (ROLE_HIERARCHY[minRole] || 0)
  const is      = (...roles) => roles.includes(role)

  return {
    role,
    level,
    atLeast,
    is,
    isSuperAdmin:  is('SUPER_ADMIN'),
    isOrgAdmin:    is('ORG_ADMIN', 'SUPER_ADMIN'),
    isAdmin:       atLeast('ADMIN'),
    isHR:          is('HR', 'ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN'),
    isManager:     is('MANAGER', 'ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN'),
    canWrite:      atLeast('MANAGER'),
    canDelete:     atLeast('ADMIN'),
    canAdminister: atLeast('ADMIN'),
  }
}
