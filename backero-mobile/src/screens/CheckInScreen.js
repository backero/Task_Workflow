import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { MapPin, Clock, CheckCircle, Navigation, Coffee } from 'lucide-react-native';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

// The backend's real self-service attendance is a 4-state punch machine (not a plain
// checkin/checkout toggle): not-punched -> office-in -> on-break -> office-in -> office-out.
// See attendance.punch.controller.js#recordPunch for the exact transition table this mirrors.
const NEXT_ACTIONS = {
  'not-punched': [{ type: 'punch-in', label: 'Punch In' }],
  'office-in': [{ type: 'break-start', label: 'Start Break' }, { type: 'punch-out', label: 'Punch Out' }],
  'on-break': [{ type: 'break-end', label: 'End Break' }],
  'office-out': [{ type: 'punch-in', label: 'Punch In' }],
};

export default function CheckInScreen() {
  const [location, setLocation] = useState(null);
  const [punchStatus, setPunchStatus] = useState('not-punched');
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trackingActive, setTrackingActive] = useState(false);
  // All refs, not state: read synchronously inside startTracking()/handlePunch() right after
  // an await, where a state variable would still hold its stale pre-update value (setState
  // only schedules a re-render, it doesn't update the variable in the current closure).
  // session id and interval handle both live only as long as the screen is mounted and the
  // app stays foregrounded (no expo-task-manager/background mode) — tracking is meant to
  // stop silently if the app is minimized or killed, not to survive it.
  const employeeCategory = useRef(null);
  const trackingSessionId = useRef(null);
  const trackingInterval = useRef(null);

  useEffect(() => {
    requestLocationPermission();
    // loadTodayStatus() may call startTracking(), which checks employeeCategory — it must
    // run after that's loaded, not in parallel with it, or a FIELD employee reopening the
    // app mid-shift would silently fail to resume tracking (category still null at that point).
    (async () => {
      await loadEmployeeCategory();
      await loadTodayStatus();
    })();
    return () => stopTracking('APP_KILLED');
  }, []);

  const loadEmployeeCategory = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/employees/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) employeeCategory.current = data.employee?.category || null;
    } catch (error) {
      console.error('Failed to load employee profile:', error);
    }
  };

  const captureAndSendPoint = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const token = await SecureStore.getItemAsync('userToken');
      await fetch(`${API_BASE}/locations/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          session_id: trackingSessionId.current,
          points: [{
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy_meters: loc.coords.accuracy,
            device_info: Platform.OS,
            client_point_id: `${trackingSessionId.current}-${Date.now()}`,
            recorded_at: new Date().toISOString(),
          }],
        }),
      });
    } catch (error) {
      // A single missed point shouldn't interrupt the shift — just skip it and retry
      // on the next tick.
      console.error('Location point upload failed:', error);
    }
  };

  const startTracking = async () => {
    if (employeeCategory.current !== 'FIELD' || trackingSessionId.current) return;
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/locations/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not start location tracking');
      trackingSessionId.current = data.session.id;
      setTrackingActive(true);
      captureAndSendPoint();
      trackingInterval.current = setInterval(captureAndSendPoint, data.session.locationIntervalSeconds * 1000);
    } catch (error) {
      console.error('Failed to start location tracking:', error);
    }
  };

  const stopTracking = async (reason = 'MANUAL') => {
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
      trackingInterval.current = null;
    }
    const sessionId = trackingSessionId.current;
    if (!sessionId) return;
    trackingSessionId.current = null;
    setTrackingActive(false);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      await fetch(`${API_BASE}/locations/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      console.error('Failed to end location tracking session:', error);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        getLocation();
      } else {
        Alert.alert('Permission Denied', 'Location access is required for attendance');
      }
    } catch (error) {
      console.error('Location permission error:', error);
    }
  };

  const getLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      });
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Location Error', 'Could not get your location');
    }
  };

  const loadTodayStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/attendance/punch/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setPunchStatus(data.currentPunchStatus || 'not-punched');
        setToday(data);
        // A fresh screen mount while already office-in (e.g. app was closed and reopened
        // mid-shift) should pick tracking back up rather than silently staying untracked
        // until the next punch.
        if (data.currentPunchStatus === 'office-in' || data.currentPunchStatus === 'on-break') {
          startTracking();
        }
      }
    } catch (error) {
      console.error('Failed to load today status:', error);
    }
  };

  const handlePunch = async (punchType) => {
    if (!location) {
      Alert.alert('Location Required', 'Unable to get your location');
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/attendance/punch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          punchType,
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        await loadTodayStatus();
        if (punchType === 'punch-in') await startTracking();
        if (punchType === 'punch-out') await stopTracking('MANUAL');
        Alert.alert('Success', data.message || 'Recorded');
      } else {
        Alert.alert('Error', data.message || 'Could not record this punch');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process punch');
      console.error('Punch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = {
    'not-punched': 'Ready to Punch In',
    'office-in': 'Punched In',
    'on-break': 'On Break',
    'office-out': 'Punched Out',
  }[punchStatus] || 'Ready to Punch In';

  const actions = NEXT_ACTIONS[punchStatus] || NEXT_ACTIONS['not-punched'];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance</Text>
        <Text style={styles.headerDate}>{dayjs().format('DD MMM YYYY')}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusContent}>
          {punchStatus === 'on-break' ? (
            <Coffee size={48} color="#c47e2a" />
          ) : (
            <Clock size={48} color="#669c2c" />
          )}
          <Text style={styles.statusText}>{statusLabel}</Text>
          {today?.officeCheckInTime && (
            <Text style={styles.statusTime}>
              In: {dayjs(today.officeCheckInTime).format('HH:mm:ss')}
            </Text>
          )}
          {trackingActive && (
            <View style={styles.trackingBadge}>
              <Navigation size={12} color="#356b9d" />
              <Text style={styles.trackingBadgeText}>Live location tracking active</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.locationCard}>
        <MapPin size={20} color="#8a8171" />
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>Your Location</Text>
          {location ? (
            <>
              <Text style={styles.coordinates}>
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </Text>
              <Text style={styles.accuracy}>Accuracy: ±{location.accuracy.toFixed(0)}m</Text>
            </>
          ) : (
            <Text style={styles.coordinates}>Getting location...</Text>
          )}
        </View>
      </View>

      {actions.map((action) => (
        <TouchableOpacity
          key={action.type}
          style={[
            styles.checkInButton,
            action.type !== 'punch-in' && styles.secondaryButton,
            loading && styles.buttonDisabled,
          ]}
          onPress={() => handlePunch(action.type)}
          disabled={loading || !location}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <CheckCircle size={24} color="white" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>{action.label}</Text>
            </>
          )}
        </TouchableOpacity>
      ))}

      {today && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Check In:</Text>
            <Text style={styles.summaryValue}>
              {today.officeCheckInTime ? dayjs(today.officeCheckInTime).format('HH:mm') : '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Check Out:</Text>
            <Text style={styles.summaryValue}>
              {today.officeCheckOutTime ? dayjs(today.officeCheckOutTime).format('HH:mm') : '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Break:</Text>
            <Text style={styles.summaryValue}>{(today.breakDuration || 0).toFixed(0)} min</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Hours Worked:</Text>
            <Text style={styles.summaryValue}>
              {(today.totalWorkHours || 0).toFixed(2)}h
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fbfaf7',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1c1917',
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 14,
    color: '#8a8171',
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e2d6',
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusContent: {
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1c1917',
    marginTop: 12,
  },
  statusTime: {
    fontSize: 12,
    color: '#8a8171',
    marginTop: 4,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf1f8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  trackingBadgeText: {
    fontSize: 11,
    color: '#356b9d',
    fontWeight: '600',
    marginLeft: 5,
  },
  locationCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e2d6',
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationContent: {
    flex: 1,
    marginLeft: 12,
  },
  locationLabel: {
    fontSize: 12,
    color: '#8a8171',
    fontWeight: '600',
  },
  coordinates: {
    fontSize: 14,
    color: '#1c1917',
    fontWeight: '500',
    marginTop: 4,
  },
  accuracy: {
    fontSize: 12,
    color: '#8a8171',
    marginTop: 2,
  },
  checkInButton: {
    backgroundColor: '#669c2c',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#c47e2a',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e2d6',
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c1917',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1ede4',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#8a8171',
  },
  summaryValue: {
    fontSize: 13,
    color: '#1c1917',
    fontWeight: '500',
  },
});
