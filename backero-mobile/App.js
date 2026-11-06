import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './src/screens/LoginScreen';
import CheckInScreen from './src/screens/CheckInScreen';
import AttendanceHistoryScreen from './src/screens/AttendanceHistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import DashboardScreen from './src/screens/DashboardScreen';

import { AuthContext } from './src/context/AuthContext';
import { Clock, BarChart3, User } from 'lucide-react-native';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AttendanceTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#669c2c',
        tabBarInactiveTintColor: '#8a8171',
        tabBarStyle: { backgroundColor: '#fbfaf7', borderTopColor: '#e7e2d6' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color }) => <BarChart3 size={24} color={color} />,
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="CheckIn"
        component={CheckInScreen}
        options={{
          tabBarIcon: ({ color }) => <Clock size={24} color={color} />,
          tabBarLabel: 'Check-in',
        }}
      />
      <Tab.Screen
        name="History"
        component={AttendanceHistoryScreen}
        options={{
          tabBarIcon: ({ color }) => <BarChart3 size={24} color={color} />,
          tabBarLabel: 'History',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [state, dispatch] = React.useReducer(
    (prevState, action) => {
      switch (action.type) {
        case 'RESTORE_TOKEN':
          return {
            ...prevState,
            userToken: action.token,
            isLoading: false,
          };
        case 'SIGN_IN':
          return {
            ...prevState,
            isSignout: false,
            userToken: action.token,
          };
        case 'SIGN_OUT':
          return {
            ...prevState,
            isSignout: true,
            userToken: null,
          };
        default:
          return prevState;
      }
    },
    {
      isLoading: true,
      isSignout: false,
      userToken: null,
    }
  );

  useEffect(() => {
    const bootstrapAsync = async () => {
      let userToken;
      try {
        userToken = await SecureStore.getItemAsync('userToken');
      } catch (e) {
        console.error('Failed to restore token:', e);
      }
      dispatch({ type: 'RESTORE_TOKEN', token: userToken });
    };

    bootstrapAsync();
  }, []);

  const authContext = React.useMemo(
    () => ({
      signIn: async (credentials) => {
        try {
          const response = await fetch('https://backero-backend-7myx.onrender.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });

          if (!response.ok) throw new Error('Login failed');

          const data = await response.json();
          await SecureStore.setItemAsync('userToken', data.token);
          await SecureStore.setItemAsync('userData', JSON.stringify(data.user));

          dispatch({ type: 'SIGN_IN', token: data.token });
        } catch (error) {
          throw error;
        }
      },
      signOut: async () => {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userData');
        dispatch({ type: 'SIGN_OUT' });
      },
      signUp: async (credentials) => {
        try {
          const response = await fetch('https://backero-backend-7myx.onrender.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });

          if (!response.ok) throw new Error('Registration failed');

          const data = await response.json();
          await SecureStore.setItemAsync('userToken', data.token);
          await SecureStore.setItemAsync('userData', JSON.stringify(data.user));

          dispatch({ type: 'SIGN_IN', token: data.token });
        } catch (error) {
          throw error;
        }
      },
    }),
    []
  );

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#fbfaf7" />
      <AuthContext.Provider value={authContext}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {state.isLoading ? (
              <Stack.Screen name="Splash" component={() => <LoadingScreen />} />
            ) : state.userToken == null ? (
              <Stack.Screen name="Auth" component={LoginScreen} />
            ) : (
              <Stack.Screen name="MainApp" component={AttendanceTabNavigator} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fbfaf7' }}>
      <ActivityIndicator size="large" color="#669c2c" />
    </View>
  );
}
