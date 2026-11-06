import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapPin, Clock, CheckCircle } from 'lucide-react-native';
import dayjs from 'dayjs';

export default function CheckInScreen() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, checking, checked
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [todayStatus, setTodayStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requestLocationPermission();
    loadTodayStatus();
  }, []);

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
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('https://backero-backend-7myx.onrender.com/api/attendance/today', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setTodayStatus(data.attendance);
      setLastCheckIn(data.lastCheckIn);
    } catch (error) {
      console.error('Failed to load today status:', error);
    }
  };

  const handleCheckIn = async () => {
    if (!location) {
      Alert.alert('Location Required', 'Unable to get your location');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      const user = JSON.parse(userData);

      const response = await fetch('https://backero-backend-7myx.onrender.com/api/attendance/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: status === 'checked' ? 'checkout' : 'checkin',
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus(status === 'idle' ? 'checked' : 'idle');
        setLastCheckIn(data.record);
        await loadTodayStatus();
        Alert.alert(
          'Success',
          status === 'idle' ? '✓ Checked In' : '✓ Checked Out'
        );
      } else {
        Alert.alert('Error', data.message || 'Check-in failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process check-in');
      console.error('Check-in error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance Check-In</Text>
        <Text style={styles.headerDate}>{dayjs().format('DD MMM YYYY')}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusContent}>
          <Clock size={48} color="#669c2c" />
          <Text style={styles.statusText}>
            {status === 'idle' ? 'Ready to Check In' : 'Checked In'}
          </Text>
          {lastCheckIn && (
            <Text style={styles.statusTime}>
              Last: {dayjs(lastCheckIn.timestamp).format('HH:mm:ss')}
            </Text>
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

      <TouchableOpacity
        style={[
          styles.checkInButton,
          status === 'checked' && styles.checkOutButton,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleCheckIn}
        disabled={loading || !location}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <CheckCircle size={24} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>
              {status === 'idle' ? 'Check In' : 'Check Out'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {todayStatus && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Check In:</Text>
            <Text style={styles.summaryValue}>
              {todayStatus.checkInTime ? dayjs(todayStatus.checkInTime).format('HH:mm') : '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Check Out:</Text>
            <Text style={styles.summaryValue}>
              {todayStatus.checkOutTime ? dayjs(todayStatus.checkOutTime).format('HH:mm') : '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Hours Worked:</Text>
            <Text style={styles.summaryValue}>
              {todayStatus.hoursWorked ? todayStatus.hoursWorked.toFixed(2) : '0.00'}h
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
    marginBottom: 20,
  },
  checkOutButton: {
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
