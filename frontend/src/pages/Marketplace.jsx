import React from 'react'
import UnifiedDashboard from './marketplace/UnifiedDashboard'

/**
 * Marketplace page - displays the complete marketplace automation dashboard
 * with real-time data collection from all platforms (Amazon, Flipkart, Meesho, Snapdeal)
 */
export default function Marketplace() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <UnifiedDashboard />
    </div>
  )
}
