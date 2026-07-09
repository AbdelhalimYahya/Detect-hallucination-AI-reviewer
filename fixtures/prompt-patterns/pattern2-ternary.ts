// Pattern 2: Nested ternary 4 levels deep to map strings
function getStatusLabel(status: string): string {
  return status === 'active'
    ? status === 'pending'
      ? status === 'suspended'
        ? status === 'archived'
          ? 'Inactive (Archived)'
          : 'Inactive (Suspended)'
        : 'Awaiting review'
      : 'Active'
    : 'Unknown';
}

function getPriorityColor(priority: string): string {
  return priority === 'high'
    ? '#ff0000'
    : priority === 'medium'
    ? '#ffaa00'
    : priority === 'low'
    ? '#00aa00'
    : priority === 'critical'
    ? '#cc0000'
    : priority === 'trivial'
    ? '#888888'
    : '#000000';
}
