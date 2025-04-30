function getStatusColor(status) {
  switch (status) {
    case 'Available':
    case 'On Scene':
      return '#4CAF50'; // Green for Available
    case 'Unavailable':
      return '#FF5722'; // Red-Orange for Unavailable
    case 'En Route':
      return '#FF5500';
    default:
      return '#9E9E9E'; // Gray for Unknown or undefined statuses
  }
}

// Attach the function to the window object to make it globally accessible
window.getStatusColor = getStatusColor;

// Function to get contrasting text color (for readability)
function getContrastingTextColor(backgroundColor) {
  const color = backgroundColor.charAt(0) === '#' ? backgroundColor.slice(1) : backgroundColor;
  const rgb = parseInt(color, 16); // Convert hex to rgb
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;

  const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return brightness > 128 ? "#FFFFFF" : "#000000"; // Return black or white text
}

// Export the getUnitTypeColor function
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

// Ensure getContrastingTextColor is also available globally
window.getContrastingTextColor = getContrastingTextColor;
