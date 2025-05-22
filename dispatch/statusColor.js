export function getStatusColor(status) {
  switch (status) {
    case 'Available':
      return '#4CAF50'; // Green for Available
    case 'Unavailable':
    case 'Busy':
    case 'Meal Break':
      return '#961600'; // Dark-Red for Unavailable
    case 'En Route':
    case 'On Scene':
      return '#FF5500';
    default:
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
