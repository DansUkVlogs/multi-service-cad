// statusColor.js

export function getStatusColor(status) {
  switch (status) {
    case 'Available':
      return '#4CAF50'; // Green for Available
    case 'Unavailable':
      return '#FF5722'; // Red-Orange for Unavailable
    case 'En Route':
      return 'orange';
    default:
      return '#9E9E9E'; // Gray for Unknown or undefined statuses
  }
}

// Function to get contrasting text color (for readability)
export function getContrastingTextColor(backgroundColor) {
  const color = backgroundColor.charAt(0) === '#' ? backgroundColor.slice(1) : backgroundColor;
  const rgb = parseInt(color, 16); // Convert hex to rgb
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >>  8) & 0xff;
  const b = (rgb >>  0) & 0xff;

  const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return brightness > 128 ? "#FFFFFF" : "#000000"; // Return black or white text
}

// Function to get color based on unit type (Ambulance, Fire, etc.)
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
