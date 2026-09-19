import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {useAuth} from '../auth/useAuth';
import GradientButton from '../components/ui/GradientButton';
import LoadingIndicator from '../components/ui/LoadingIndicator';
import {Snackbar} from '../components/snackbar';
import {useGetMyEmployeeProfileQuery, useUpdateMyEmployeeProfileMutation} from '../store/employeesApi';
import {destructive, neutral, primary, radius, spacing, surface, text as textColor, typography} from '../theme/palette';
import type {Employee} from '../types/models';

const READ_ONLY_ROWS: {label: string; value: (employee: Employee) => string | null}[] = [
  {label: 'Employee Code', value: employee => employee.employee_code},
  {label: 'Email', value: employee => employee.email},
  {label: 'Category', value: employee => employee.category},
  {label: 'Date of Joining', value: employee => employee.date_of_joining},
];

export default function ProfileScreen(): React.JSX.Element {
  const {logout} = useAuth();
  const {data: employee, isLoading, isError, refetch} = useGetMyEmployeeProfileQuery();
  const [updateMyEmployeeProfile, {isLoading: isSaving}] = useUpdateMyEmployeeProfileMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const startEditing = (): void => {
    setPhoneInput(employee?.phone ?? '');
    setSaveError(null);
    setIsEditing(true);
  };

  const handleSave = async (): Promise<void> => {
    setSaveError(null);
    try {
      await updateMyEmployeeProfile({phone: phoneInput.trim() || null}).unwrap();
      setIsEditing(false);
      Snackbar.show({text: 'Profile updated.', duration: Snackbar.LENGTH_SHORT, backgroundColor: primary.active, textColor: surface});
    } catch {
      setSaveError('Could not update your profile.');
    }
  };

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logout();
      Snackbar.show({text: 'Logged out.', duration: Snackbar.LENGTH_SHORT, backgroundColor: primary.active, textColor: surface});
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading && !employee) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator />
      </View>
    );
  }

  if (isError || !employee) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>No employee profile is linked to your account yet.</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
          <Text style={styles.logoutText}>{isLoggingOut ? 'Logging out…' : 'Log out'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{employee.full_name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{employee.full_name}</Text>

      <View style={styles.card}>
        {READ_ONLY_ROWS.map(row => {
          const value = row.value(employee);
          if (!value) return null;
          return (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          );
        })}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Phone</Text>
          {isEditing ? (
            <TextInput
              style={styles.phoneInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="Enter phone number"
              placeholderTextColor={neutral[400]}
              keyboardType="phone-pad"
              autoFocus
            />
          ) : (
            <Text style={styles.rowValue}>{employee.phone ?? '—'}</Text>
          )}
        </View>
      </View>

      {isEditing ? (
        <>
          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)} disabled={isSaving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <GradientButton title={isSaving ? 'Saving…' : 'Save Changes'} onPress={handleSave} loading={isSaving} style={styles.saveButton} />
          </View>
        </>
      ) : (
        <TouchableOpacity style={styles.editButton} onPress={startEditing}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
        <Text style={styles.logoutText}>{isLoggingOut ? 'Logging out…' : 'Log out'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface},
  content: {padding: spacing.xl},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: surface, padding: spacing.xl},
  avatar: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: primary.base,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    color: surface,
    fontSize: 28,
    fontWeight: typography.weight.semibold as '600',
  },
  name: {
    fontSize: typography.scale.h1.size,
    fontWeight: typography.scale.h1.weight as '600',
    color: textColor.primary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: surface,
    borderWidth: 1,
    borderColor: neutral[200],
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: neutral[100],
  },
  rowLabel: {fontSize: typography.scale.body.size, color: textColor.secondary},
  rowValue: {fontSize: typography.scale.body.size, color: textColor.primary, fontWeight: typography.weight.medium as '500'},
  phoneInput: {
    flex: 1,
    marginLeft: spacing.lg,
    textAlign: 'right',
    fontSize: typography.scale.body.size,
    color: textColor.primary,
    padding: 0,
  },
  error: {fontSize: typography.scale.body.size, color: destructive},
  saveError: {fontSize: typography.scale.caption.size, color: destructive, marginTop: spacing.md},
  editButton: {
    marginTop: spacing.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: neutral[200],
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  editButtonText: {
    color: primary.base,
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.medium as '500',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  cancelButton: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: neutral[200],
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: textColor.primary,
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.medium as '500',
  },
  saveButton: {flex: 1, marginTop: 0},
  logoutButton: {
    marginTop: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: neutral[200],
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  logoutText: {
    color: destructive,
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.medium as '500',
  },
});
