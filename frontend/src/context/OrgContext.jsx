import React, { createContext, useContext, useState } from 'react'

const OrgContext = createContext()

export const OrgProvider = ({ children }) => {
  const [org, setOrg] = useState(null)

  return (
    <OrgContext.Provider value={{ org, setOrg }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => {
  const context = useContext(OrgContext)
  if (!context) throw new Error('useOrg must be used within OrgProvider')
  return context
}
