// Shared add/edit Employee form — used by both Attendance -> Employees and
// Management -> Employee Details, so the employee_code/department/designation/
// category/photo/user-linking logic lives in exactly one place.
import React, { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { User as UserIcon } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Avatar, Button, Col, Drawer, Input, Row, Select, Space, Typography } from 'antd';

const { Text } = Typography;

const CATEGORIES = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'FIELD', label: 'Field' },
];

// Best-effort match of a User's free-text department against the relational
// Department list — used to pre-fill (not auto-create) in the manual form.
function matchDepartmentId(departmentName, departments) {
  const name = (departmentName || '').trim().toLowerCase();
  if (!name) return '';
  const match = departments.find((d) => d.name.trim().toLowerCase() === name);
  return match?._id || '';
}

export default function EmployeeFormDrawer({ open, onClose, editEmployee, departments, users }) {
  const qc = useQueryClient();
  const isEdit = !!editEmployee;
  const { handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '' },
  });
  const departmentId = watch('department_id');

  // Pick an existing User -> auto-fill their known details instead of
  // re-typing them; everything stays editable before submit.
  const handleLinkedUserChange = (userId) => {
    const user = users.find((u) => u._id === userId);
    if (!user) return;
    setValue('full_name', `${user.firstName} ${user.lastName}`.trim());
    if (user.phone) setValue('phone', user.phone);
    const matchedDept = matchDepartmentId(user.department, departments);
    if (matchedDept) setValue('department_id', matchedDept);
  };

  const { data: designationsData } = useQuery({
    queryKey: ['designations', departmentId],
    queryFn: () => api.get('/employees/designations', { params: { department_id: departmentId } }).then((r) => r.data),
    enabled: !!departmentId,
  });
  const designations = designationsData?.designations || [];

  const fileInputRef = useRef(null);
  const photoMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('photo', file);
      return api.post(`/employees/${editEmployee._id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Photo updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to upload photo'),
  });
  const onPhotoSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) photoMutation.mutate(file);
  };

  useEffect(() => {
    if (open) {
      reset(editEmployee
        ? {
            employee_code: editEmployee.employeeCode, full_name: editEmployee.fullName, phone: editEmployee.phone || '',
            department_id: editEmployee.departmentId?._id || editEmployee.departmentId || '',
            designation_id: editEmployee.designationId?._id || editEmployee.designationId || '',
            category: editEmployee.category, date_of_joining: editEmployee.dateOfJoining ? editEmployee.dateOfJoining.slice(0, 10) : '',
            user_id: editEmployee.userId?._id || editEmployee.userId || '',
          }
        : { employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '' }
      );
    }
  }, [open, editEmployee]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        full_name: data.full_name, phone: data.phone || undefined,
        department_id: data.department_id, designation_id: data.designation_id,
        category: data.category, user_id: data.user_id || undefined,
      };
      if (isEdit) return api.patch(`/employees/${editEmployee._id}`, payload);
      return api.post('/employees', { ...payload, employee_code: data.employee_code, date_of_joining: data.date_of_joining });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(isEdit ? 'Employee updated' : 'Employee added');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save employee'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={460}
      title={isEdit ? `Edit — ${editEmployee?.fullName}` : 'Add Employee'}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={handleSubmit(mutation.mutate)}>{isEdit ? 'Save Changes' : 'Add Employee'}</Button>
        </Space>
      }
    >
      <form onSubmit={handleSubmit(mutation.mutate)}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {isEdit && (
            <Space align="center" size={14}>
              <Avatar size={56} src={editEmployee.photo || undefined} icon={<UserIcon size={24} />} />
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoSelected} />
                <Button size="small" loading={photoMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                  {editEmployee.photo ? 'Change Photo' : 'Add Photo'}
                </Button>
              </div>
            </Space>
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Employee Code *</Text>
              <Controller
                name="employee_code" control={control} rules={{ required: 'Required' }}
                render={({ field }) => (
                  <Input
                    {...field} placeholder="EMP-001" disabled={isEdit} style={{ textTransform: 'uppercase' }}
                    status={errors.employee_code ? 'error' : undefined}
                  />
                )}
              />
              {errors.employee_code && <Text type="danger" style={{ fontSize: 11 }}>{errors.employee_code.message}</Text>}
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Date of Joining *</Text>
              <Controller
                name="date_of_joining" control={control} rules={{ required: 'Required' }}
                render={({ field }) => (
                  <Input type="date" {...field} disabled={isEdit} status={errors.date_of_joining ? 'error' : undefined} />
                )}
              />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Full Name *</Text>
            <Controller
              name="full_name" control={control} rules={{ required: 'Required' }}
              render={({ field }) => (
                <Input {...field} placeholder="Priya Sharma" status={errors.full_name ? 'error' : undefined} />
              )}
            />
            {errors.full_name && <Text type="danger" style={{ fontSize: 11 }}>{errors.full_name.message}</Text>}
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Phone</Text>
            <Controller
              name="phone" control={control}
              render={({ field }) => <Input {...field} placeholder="9876543210" />}
            />
          </div>

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Department *</Text>
              <Controller
                name="department_id" control={control} rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    {...field} style={{ width: '100%' }} placeholder="Select…"
                    onChange={(v) => field.onChange(v)}
                    options={departments.map((d) => ({ label: d.name, value: d._id }))}
                  />
                )}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Designation *</Text>
              <Controller
                name="designation_id" control={control} rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    {...field} style={{ width: '100%' }} placeholder={departmentId ? 'Select…' : 'Pick a department first'}
                    disabled={!departmentId} options={designations.map((d) => ({ label: d.title, value: d._id }))}
                  />
                )}
              />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Category *</Text>
            <Controller
              name="category" control={control} rules={{ required: true }}
              render={({ field }) => <Select {...field} style={{ width: '100%' }} options={CATEGORIES} />}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Field employees can be GPS-tracked during a work session; Office employees never are.</Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Linked User Account</Text>
            <Controller
              name="user_id" control={control}
              render={({ field }) => (
                <Select
                  {...field} style={{ width: '100%' }} placeholder="— Unlinked —" allowClear
                  showSearch optionFilterProp="label"
                  onChange={(v) => { field.onChange(v); if (v) handleLinkedUserChange(v); }}
                  options={users.map((u) => ({ label: `${u.firstName} ${u.lastName} (${u.email})`, value: u._id }))}
                />
              )}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Lets this person sign in and see their own attendance/payroll.</Text>
          </div>
        </Space>
      </form>
    </Drawer>
  );
}
