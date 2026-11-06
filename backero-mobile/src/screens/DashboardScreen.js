import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarChart3, Clock, AlertCircle } from 'lucide-react-native';
import dayjs from 'dayjs';

export default function DashboardScreen() {
  const [stats, setStats] = useState(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      const user = JSON.parse(userData);
      setUserName(user.name);

      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('https://backero-backend-7myx.onrender.com/api/attendance/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

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
            title="Hours This Month"
            value={`${stats.hoursThisMonth || 0}h`}
            color="#669c2c"
          />
          <StatCard
            icon={BarChart3}
            title="Days Present"
            value={`${stats.daysPresent || 0}/${stats.workingDays || 0}`}
            color="#2196F3"
          />
          <StatCard
            icon={AlertCircle}
            title="Leave Balance"
            value={`${stats.leaveBalance || 0} days`}
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
