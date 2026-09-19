import {zodResolver} from '@hookform/resolvers/zod';
import {EditOutlined} from '@ant-design/icons';
import {App, Descriptions, Flex, Typography} from 'antd';
import {useState} from 'react';
import type React from 'react';
import {Controller, useForm} from 'react-hook-form';
import {z} from 'zod';

import {updateMyEmployeeProfile} from '../api/employees';
import {ApiError} from '../api/httpClient';
import {useAuth} from '../auth/useAuth';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import PageHeader from '../components/ui/PageHeader';

const profileFormSchema = z.object({
  phone: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage(): React.JSX.Element {
  const {message} = App.useApp();
  const {currentUser, employee, setEmployee} = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<ProfileFormValues>({resolver: zodResolver(profileFormSchema), defaultValues: {phone: employee?.phone ?? ''}});

  const startEditing = (): void => {
    reset({phone: employee?.phone ?? ''});
    setSubmitError(null);
    setIsEditing(true);
  };

  const onSubmit = handleSubmit(async values => {
    setSubmitError(null);
    try {
      const updated = await updateMyEmployeeProfile({phone: values.phone?.trim() || null});
      setEmployee(updated);
      message.success('Profile updated.');
      setIsEditing(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not update your profile.');
    }
  });

  return (
    <div>
      <PageHeader title="Profile" description="Your account and employee details." />

      <Card>
        {employee ? (
          isEditing ? (
            <form onSubmit={onSubmit}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Full name">{employee.full_name}</Descriptions.Item>
                <Descriptions.Item label="Employee code">{employee.employee_code}</Descriptions.Item>
                <Descriptions.Item label="Category">{employee.category}</Descriptions.Item>
                <Descriptions.Item label="Phone">
                  <Controller
                    name="phone"
                    control={control}
                    render={({field}) => (
                      <div>
                        <Input {...field} placeholder="Enter phone number" />
                        {errors.phone?.message ? (
                          <Typography.Text type="danger" style={{display: 'block', marginTop: 4, fontSize: 12.5}}>
                            {errors.phone.message}
                          </Typography.Text>
                        ) : null}
                      </div>
                    )}
                  />
                </Descriptions.Item>
                <Descriptions.Item label="Date of joining">{employee.date_of_joining}</Descriptions.Item>
                <Descriptions.Item label="Email">{currentUser?.email}</Descriptions.Item>
              </Descriptions>

              {submitError ? (
                <Typography.Text type="danger" role="alert" style={{display: 'block', marginTop: 16}}>
                  {submitError}
                </Typography.Text>
              ) : null}

              <Flex gap={8} justify="flex-end" style={{marginTop: 16}}>
                <Button type="button" variant="secondary" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save Changes'}
                </Button>
              </Flex>
            </form>
          ) : (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Full name">{employee.full_name}</Descriptions.Item>
                <Descriptions.Item label="Employee code">{employee.employee_code}</Descriptions.Item>
                <Descriptions.Item label="Category">{employee.category}</Descriptions.Item>
                <Descriptions.Item label="Phone">{employee.phone ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Date of joining">{employee.date_of_joining}</Descriptions.Item>
                <Descriptions.Item label="Email">{currentUser?.email}</Descriptions.Item>
              </Descriptions>

              <Flex justify="flex-end" style={{marginTop: 16}}>
                <Button onClick={startEditing}>
                  <EditOutlined /> Edit Profile
                </Button>
              </Flex>
            </>
          )
        ) : (
          <EmptyState title="No employee profile is linked to your account yet" description="Contact HR if you believe this is a mistake." />
        )}
      </Card>
    </div>
  );
}
