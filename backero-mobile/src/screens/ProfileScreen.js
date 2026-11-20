import React, { useState, useEffect, useContext } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Mail, Phone, Briefcase, Calendar, LogOut, User as UserIcon } from 'lucide-react-native';
import dayjs from 'dayjs';
import { AuthContext } from '../context/AuthContext';
import { API_BASE } from '../config';

export default function ProfileScreen() {
  const { signOut } = useContext(AuthContext);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${API_BASE}/employees/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setEmployee(data.employee);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#669c2c" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatarSection}>
        {employee?.photo ? (
          <Image source={{ uri: employee.photo }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserIcon size={36} color="#8a8171" />
          </View>
        )}
        <Text style={styles.name}>{employee?.fullName || 'Employee'}</Text>
        <Text style={styles.code}>{employee?.employeeCode}</Text>
      </View>

      <View style={styles.card}>
        <InfoRow icon={Mail} label="Email" value={employee?.email || '—'} />
        <InfoRow icon={Phone} label="Phone" value={employee?.phone || '—'} />
        <InfoRow icon={Briefcase} label="Category" value={employee?.category || '—'} />
        <InfoRow
          icon={Calendar}
          label="Joined"
          value={employee?.dateOfJoining ? dayjs(employee.dateOfJoining).format('DD MMM YYYY') : '—'}
        />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <LogOut size={18} color="white" style={{ marginRight: 8 }} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Icon size={18} color="#8a8171" />
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
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
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#eee8d8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1c1917' },
  code: { fontSize: 13, color: '#8a8171', marginTop: 2 },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e2d6',
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1ede4',
  },
  infoLabel: { fontSize: 11, color: '#8a8171', fontWeight: '600' },
  infoValue: { fontSize: 14, color: '#1c1917', marginTop: 2, textTransform: 'capitalize' },
  signOutButton: {
    flexDirection: 'row',
    backgroundColor: '#b3463c',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
