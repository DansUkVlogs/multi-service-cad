export function getStatusColor(status) {
  if (!status) return '#9E9E9E';
  const s = status.toLowerCase();

  // Direct matches for common statuses
  switch (s) {
    case 'available':
      return '#43A047'; // Deep Green
    case 'unavailable':
      return '#D32F2F'; // Strong Red
    case 'busy':
    case 'on scene':
      return '#FF9800'; // Orange
    case 'meal break':
      return '#D32F2F'; // Strong Red
    case 'en route':
      return '#0288D1'; // Cyan Blue
    default:
      // Handle prefix-based statuses
      if (s.startsWith('transporting to hospital')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to hospital')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to standby')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('at hospital')) return '#FF9800'; // Orange
      if (s.startsWith('at hospital')) return '#FF9800'; // Orange
      if (s.startsWith('at standby')) return '#FF9800'; // Orange
      return '#9E9E9E'; // Gray for Unknown or undefined statuses
  }
}

export function getContrastingTextColor(backgroundColor) {
  const color = backgroundColor.charAt(0) === '#' ? backgroundColor.slice(1) : backgroundColor;
  const rgb = parseInt(color, 16); // Convert hex to rgb
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;

  const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return brightness > 128 ? "#FFFFFF" : "#000000"; // Return black or white text
}

export function getUnitTypeColor(unitType) {
  switch (unitType) {
    case 'Ambulance':
      return '#81C784'; // Light green for Ambulance
    case 'Fire':
      return '#FF7043'; // Light red-orange for Fire
    case 'Police':
      return '#64B5F6'; // Light blue for Police
    case 'Multiple':
      return 'gold';
    default:
      return '#BDBDBD'; // Light gray for unknown
  }
}
