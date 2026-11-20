import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { BarChart3, Clock, AlertCircle } from 'lucide-react-native';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

export default function DashboardScreen() {
  const [stats, setStats] = useState(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const userData = await SecureStore.getItemAsync('userData');
      const user = JSON.parse(userData);
      setUserName(`${user.firstName || ''} ${user.lastName || ''}`.trim());

      const token = await SecureStore.getItemAsync('userToken');
      // No single "my stats" endpoint exists server-side — built here from the two
      // real self-service endpoints that do: today's punch status
      // (attendance.punch.controller.js) and leave balances (leave.controller.js#getMyBalances).
      const [todayRes, leaveRes] = await Promise.all([
        fetch(`${API_BASE}/attendance/punch/today`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/leave/balances/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const today = await todayRes.json();
      const leave = await leaveRes.json();
      const leaveBalance = (leave.balances || []).reduce(
        (sum, b) => sum + ((b.totalDays || 0) - (b.usedDays || 0)), 0,
      );

      setStats({
        hoursToday: today.totalWorkHours || 0,
        currentPunchStatus: today.currentPunchStatus || 'not-punched',
        leaveBalance,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

  const statusLabel = {
    'not-punched': 'Not punched in',
    'office-in': 'Punched in',
    'on-break': 'On break',
    'office-out': 'Punched out',
  }[stats?.currentPunchStatus] || 'Not punched in';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome, {userName}</Text>
        <Text style={styles.date}>{dayjs().format('dddd, DD MMMM')}</Text>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <StatCard
            icon={Clock}
            title="Hours Today"
            value={`${stats.hoursToday.toFixed(1)}h`}
            color="#669c2c"
          />
          <StatCard
            icon={BarChart3}
            title="Status"
            value={statusLabel}
            color="#2196F3"
          />
          <StatCard
            icon={AlertCircle}
            title="Leave Balance"
            value={`${stats.leaveBalance} days`}
            color="#FF9800"
          />
        </View>
      )}

      <TouchableOpacity style={styles.refreshButton} onPress={loadDashboard}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ icon: Icon, title, value, color }) {
  return (
    <View style={styles.statCard}>
      <Icon size={32} color={color} />
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fbfaf7', paddingHorizontal: 16, paddingVertical: 20 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#1c1917' },
  date: { fontSize: 14, color: '#8a8171', marginTop: 4 },
  statsContainer: { gap: 12, marginBottom: 24 },
  statCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e7e2d6' },
  statTitle: { fontSize: 12, color: '#8a8171', marginTop: 8, fontWeight: '500' },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  refreshButton: { backgroundColor: '#669c2c', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  refreshText: { color: 'white', fontWeight: '600' },
});
