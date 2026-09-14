// Shared status/priority display maps for the workflow-v2 pages — status
// values match TaskStatus (app/models/task.py) verbatim, including spaces.
export const STATUS_COLUMNS = [
  { key: 'Pending', label: 'Pending', color: 'default' },
  { key: 'Assigned', label: 'Assigned', color: 'blue' },
  { key: 'In Progress', label: 'In Progress', color: 'gold' },
  { key: 'Changes Requested', label: 'Changes Requested', color: 'red' },
  { key: 'Approval Pending', label: 'Approval Pending', color: 'purple' },
  { key: 'Completed', label: 'Completed', color: 'green' },
];

export const PRIORITY_COLOR = {
  low: 'default',
  medium: 'gold',
  high: 'orange',
  critical: 'red',
  urgent: 'magenta',
};

export const STATUS_COLOR = STATUS_COLUMNS.reduce((acc, c) => {
  acc[c.key] = c.color;
  return acc;
}, { Reopened: 'orange', Achieved: 'green', Cancelled: 'default', 'Under Review': 'purple' });
