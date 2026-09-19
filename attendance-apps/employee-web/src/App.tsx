import type React from 'react';
import {BrowserRouter, Route, Routes} from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AttendanceHistoryPage from './pages/AttendanceHistoryPage';
import DashboardPage from './pages/DashboardPage';
import FieldSessionPage from './pages/FieldSessionPage';
import HolidaysPage from './pages/HolidaysPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/attendance-history" element={<AttendanceHistoryPage />} />
            <Route path="/holidays" element={<HolidaysPage />} />
            <Route path="/field-session" element={<FieldSessionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
