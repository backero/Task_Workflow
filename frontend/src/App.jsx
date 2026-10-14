import { useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { OrgProvider } from './context/OrgContext'
import { SocketProvider } from './context/SocketContext'

import Marketplace from './pages/Marketplace'

export default function App() {
  const queryClient = useMemo(() => new QueryClient(), [])

  return (
    <AuthProvider>
      <OrgProvider>
        <SocketProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Routes>
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/" element={<Navigate to="/marketplace" replace />} />
                <Route path="*" element={<Navigate to="/marketplace" replace />} />
              </Routes>
            </BrowserRouter>
          </QueryClientProvider>
        </SocketProvider>
      </OrgProvider>
    </AuthProvider>
  )
}
