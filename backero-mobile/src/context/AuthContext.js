import React from 'react';

export const AuthContext = React.createContext({
  signIn: async () => {},
  signOut: async () => {},
  signUp: async () => {},
});
