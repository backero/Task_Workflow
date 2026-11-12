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

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
];

const DEFAULT_FORM_VALUES = {
  employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '',
  employment_type: 'FULL_TIME', shift_start_time: '', shift_end_time: '', half_day_min_hours: '',
  bank_name: '', bank_ifsc: '', bank_account_number: '', bank_branch: '', bank_account_type: '',
};

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
    defaultValues: DEFAULT_FORM_VALUES,
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
            employment_type: editEmployee.employmentType || 'FULL_TIME',
            shift_start_time: editEmployee.shiftStartTime || '', shift_end_time: editEmployee.shiftEndTime || '',
            half_day_min_hours: editEmployee.halfDayMinHours != null ? String(editEmployee.halfDayMinHours) : '',
            bank_name: editEmployee.bankName || '', bank_ifsc: editEmployee.bankIfsc || '',
            bank_account_number: editEmployee.bankAccountNumber || '', bank_branch: editEmployee.bankBranch || '',
            bank_account_type: editEmployee.bankAccountType || '',
          }
        : DEFAULT_FORM_VALUES
      );
    }
  }, [open, editEmployee]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        full_name: data.full_name, phone: data.phone || undefined,
        department_id: data.department_id, designation_id: data.designation_id,
        category: data.category, user_id: data.user_id || undefined,
        employment_type: data.employment_type,
        // Sent as-is (even when '') rather than falling back to undefined —
        // this form always submits the full record, so an empty string here
        // means "clear the override back to the org default", which the
        // backend only does when the key is present at all (undefined = "don't touch").
        shift_start_time: data.shift_start_time, shift_end_time: data.shift_end_time,
        half_day_min_hours: data.half_day_min_hours,
        bank_name: data.bank_name, bank_ifsc: data.bank_ifsc,
        bank_account_number: data.bank_account_number, bank_branch: data.bank_branch,
        bank_account_type: data.bank_account_type,
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

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Employment Type *</Text>
              <Controller
                name="employment_type" control={control} rules={{ required: true }}
                render={({ field }) => <Select {...field} style={{ width: '100%' }} options={EMPLOYMENT_TYPES} />}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Half-Day Min Hours</Text>
              <Controller
                name="half_day_min_hours" control={control}
                render={({ field }) => <Input {...field} type="number" step="0.5" placeholder="Org default" />}
              />
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Shift Start</Text>
              <Controller
                name="shift_start_time" control={control}
                render={({ field }) => <Input {...field} type="time" placeholder="Org default" />}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Shift End</Text>
              <Controller
                name="shift_end_time" control={control}
                render={({ field }) => <Input {...field} type="time" placeholder="Org default" />}
              />
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -8 }}>
            Leave shift times and half-day hours blank to use the org-wide default — set them for a part-time employee working different hours.
          </Text>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Bank Details (for payslips)</Text>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Controller name="bank_name" control={control} render={({ field }) => <Input {...field} placeholder="Bank Name" />} />
              <Row gutter={12}>
                <Col span={12}>
                  <Controller name="bank_account_number" control={control} render={({ field }) => <Input {...field} placeholder="Account Number" />} />
                </Col>
                <Col span={12}>
                  <Controller name="bank_ifsc" control={control} render={({ field }) => <Input {...field} placeholder="IFSC Code" style={{ textTransform: 'uppercase' }} />} />
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Controller name="bank_branch" control={control} render={({ field }) => <Input {...field} placeholder="Branch Name" />} />
                </Col>
                <Col span={12}>
                  <Controller name="bank_account_type" control={control} render={({ field }) => <Input {...field} placeholder="Account Type (e.g. Savings)" />} />
                </Col>
              </Row>
            </Space>
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
