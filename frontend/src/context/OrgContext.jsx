import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import { useAuth } from './AuthContext'

const OrgContext = createContext(null)

export const OrgProvider = ({ children }) => {
  const { user } = useAuth()
  const [org, setOrg] = useState(null)
  const [members, setMembers] = useState([])
  const [loadingOrg, setLoadingOrg] = useState(false)

  const fetchOrg = useCallback(async () => {
    if (!user?.organizationId) { setOrg(null); return }
    setLoadingOrg(true)
    try {
      const { data } = await api.get('/org')
      setOrg(data.data.org)
    } catch {
      setOrg(null)
    } finally {
      setLoadingOrg(false)
    }
  }, [user?.organizationId])

  const fetchMembers = useCallback(async () => {
    if (!user?.organizationId) return
    try {
      const { data } = await api.get('/org/members')
      setMembers(data.data.members)
    } catch {
      setMembers([])
    }
  }, [user?.organizationId])

  useEffect(() => {
    fetchOrg()
    fetchMembers()
  }, [fetchOrg, fetchMembers])

  return (
    <OrgContext.Provider value={{ org, members, loadingOrg, fetchOrg, fetchMembers, setOrg, setMembers }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
