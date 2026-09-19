import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LayoutDashboard, History, CalendarDays, MapPin, UserRound} from 'lucide-react-native';
import React from 'react';
import BootSplash from 'react-native-bootsplash';

import {useAuth} from '../auth/useAuth';
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FieldSessionScreen from '../screens/FieldSessionScreen';
import HolidaysScreen from '../screens/HolidaysScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import {useGetMyEmployeeProfileQuery} from '../store/employeesApi';
import {neutral, primary, surface} from '../theme/palette';
import { Pressable } from 'react-native';

const AuthStack = createNativeStackNavigator();
const AppTabs = createBottomTabNavigator();

const tabBarScreenOptions = {
  headerStyle: {backgroundColor: surface},
  headerTintColor: primary.base,
  headerShadowVisible: false,
  tabBarStyle: {borderTopColor: neutral[200]},
  tabBarActiveTintColor: primary.base,
  tabBarInactiveTintColor: neutral[400],
    tabBarButton: (props: any) => (
    <Pressable
      {...props}
      android_ripple={{color: 'transparent'}}
    />
  ),
};

type TabIconProps = {color: string; size: number};

function DashboardIcon(props: TabIconProps): React.JSX.Element {
  return <LayoutDashboard {...props} />;
}

function HistoryIcon(props: TabIconProps): React.JSX.Element {
  return <History {...props} />;
}

function ProfileIcon(props: TabIconProps): React.JSX.Element {
  return <UserRound {...props} />;
}

function FieldSessionIcon(props: TabIconProps): React.JSX.Element {
  return <MapPin {...props} />;
}

function HolidaysIcon(props: TabIconProps): React.JSX.Element {
  return <CalendarDays {...props} />;
}

function AppTabNavigator(): React.JSX.Element {
  // Mirrors apps/employee-web's Layout.tsx: the Field Session tab only
  // appears for FIELD-category employees. `skip` never applies here since
  // the tabs only render once authenticated, so a profile always exists to
  // fetch (or the "no employee profile linked" screen simply never shows a
  // Field Session tab, which is correct either way).
  const {data: employee} = useGetMyEmployeeProfileQuery();
  const isFieldEmployee = employee?.category === 'FIELD';

  return (
    <AppTabs.Navigator screenOptions={tabBarScreenOptions}>
      <AppTabs.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{tabBarIcon: DashboardIcon, animation: 'shift', headerShown: false}}
      />
      <AppTabs.Screen
        name="History"
        component={AttendanceHistoryScreen}
        options={{
          title: 'Attendance History',
          tabBarIcon: HistoryIcon,
          animation: 'shift',
          headerShown: false,
        }}
      />
      <AppTabs.Screen
        name="Holidays"
        component={HolidaysScreen}
        options={{title: 'Holidays', tabBarIcon: HolidaysIcon, animation: 'shift', headerShown: false}}
      />
      {isFieldEmployee ? (
        <AppTabs.Screen
          name="FieldSession"
          component={FieldSessionScreen}
          options={{title: 'Field Session', tabBarIcon: FieldSessionIcon, animation: 'shift', headerShown: false}}
        />
      ) : null}
      <AppTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{tabBarIcon: ProfileIcon, animation: 'shift', headerShown: false}}
      />
    </AppTabs.Navigator>
  );
}

export default function RootNavigator(): React.JSX.Element {
  const {isAuthenticated} = useAuth();

  return (
    <NavigationContainer
      onReady={() => {
        BootSplash.hide({fade: true});
      }}>
      {isAuthenticated ? (
        <AppTabNavigator />
      ) : (
        <AuthStack.Navigator screenOptions={{headerShown: false}}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
