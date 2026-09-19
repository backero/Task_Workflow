import {Flex, Spin} from 'antd';
import type React from 'react';
import {Navigate, Outlet} from 'react-router-dom';

import {useAuth} from '../auth/useAuth';

export default function ProtectedRoute(): React.JSX.Element {
  const {isAuthenticated, isBootstrapping} = useAuth();

  if (isBootstrapping) {
    return (
      <Flex align="center" justify="center" style={{height: '100vh'}}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
