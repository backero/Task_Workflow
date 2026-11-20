import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Calendar } from 'lucide-react-native';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

const STATUS_COLORS = {
  present: '#669c2c',
  late: '#c47e2a',
  'early-leave': '#c47e2a',
  'half-day': '#8a8171',
  absent: '#b3463c',
};

export default function AttendanceHistoryScreen() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/attendance/punch/history?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load attendance history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#669c2c" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance History</Text>
        <Text style={styles.headerSubtitle}>Last 30 days</Text>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Calendar size={40} color="#ccc4b3" />
          <Text style={styles.emptyText}>No attendance records yet</Text>
        </View>
      ) : (
        logs.map((log) => (
          <View key={log._id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardDate}>{dayjs(log.createdAt).format('ddd, DD MMM YYYY')}</Text>
              <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[log.status] || '#8a8171'}22` }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[log.status] || '#8a8171' }]}>
                  {log.status}
                </Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Check In</Text>
              <Text style={styles.cardValue}>
                {log.officeCheckInTime ? dayjs(log.officeCheckInTime).format('HH:mm') : '—'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Check Out</Text>
              <Text style={styles.cardValue}>
                {log.officeCheckOutTime ? dayjs(log.officeCheckOutTime).format('HH:mm') : '—'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Hours Worked</Text>
              <Text style={styles.cardValue}>{(log.totalWorkHours || 0).toFixed(2)}h</Text>
            </View>
          </View>
        ))
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
  centered: {
    flex: 1,
    backgroundColor: '#fbfaf7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1c1917' },
  headerSubtitle: { fontSize: 14, color: '#8a8171', marginTop: 4 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#8a8171', marginTop: 12, fontSize: 14 },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e2d6',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDate: { fontSize: 14, fontWeight: '600', color: '#1c1917' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cardLabel: { fontSize: 13, color: '#8a8171' },
  cardValue: { fontSize: 13, color: '#1c1917', fontWeight: '500' },
});
