export function getStatusColor(status) {
  if (!status) return '#9E9E9E';
  const s = status.toLowerCase();

  // Direct matches for common statuses
  switch (s) {
    case 'available':
      return '#43A047'; // Deep Green
    case 'unavailable':
    case 'panic':
    case 'meal break':
      return '#D32F2F'; // Strong Red
    case 'busy':
    case 'on scene':
      return '#FF9800'; // Orange
    case 'en route':
      return '#0288D1'; // Cyan Blue
    default:
      // Handle prefix-based statuses - Special Button Patterns
      
      // Hospital Button Statuses
      if (s.startsWith('transporting to hospital -')) return '#0288D1'; // Cyan Blue - "Transporting To Hospital - LOCATION"
      if (s.startsWith('at hospital -')) return '#FF9800'; // Orange - "At Hospital - LOCATION"
      
      // Custody Button Statuses  
      if (s.startsWith('transporting to custody -')) return '#0288D1'; // Cyan Blue - "Transporting To Custody - LOCATION"
      if (s.startsWith('booking at custody -')) return '#D32F2F'; // Strong Red - "Booking At Custody - LOCATION"

      // Standby Button Statuses (used by both Hospital and Base buttons)
      if (s.startsWith('going to standby -')) return '#0288D1'; // Cyan Blue - "Going to Standby - LOCATION"
      if (s.startsWith('at standby -')) return '#43A047'; // Deep Green - "At Standby - LOCATION"
      
      // Legacy patterns for backward compatibility
      if (s.startsWith('transporting to hospital')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to hospital')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to standby')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to base')) return '#0288D1'; // Cyan Blue
      if (s.startsWith('going to replenish at base')) return '#D32F2F'; // Strong Red
      if (s.startsWith('at hospital')) return '#FF9800'; // Orange
      if (s.startsWith('at standby')) return '#43A047'; // Deep Green
      if (s.startsWith('at base - replenishing')) return '#D32F2F'; // Strong Red
      if (s.startsWith('at base')) return '#43A047'; // Deep Green
      if (s.startsWith('refueling')) return '#D32F2F'; // Strong Red
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
