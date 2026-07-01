import { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';

let attempted = false;

export default function DevAutoLogin() {
  const { user, setAuth } = useAuthStore();

  useEffect(() => {
    if (attempted || user) return;
    const email = import.meta.env.VITE_DEV_EMAIL;
    const password = import.meta.env.VITE_DEV_PASSWORD;
    if (!email || !password) return;

    attempted = true;
    api.post('/auth/login', { email, password })
      .then((res) => {
        const { user, accessToken, organization } = res.data;
        setAuth(user, accessToken, organization);
      })
      .catch(() => { attempted = false; });
  }, []);

  return null;
}
