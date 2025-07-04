# Status Collection Management Implementation

## Overview
Implemented logic to automatically manage the `availableUnits` and `attachedUnit` collections based on unit status changes.

## Implementation Details

### New Function: `manageUnitCollections(unitId, status)`
This function is called whenever a unit's status changes and handles:

1. **When status is "Unavailable":**
   - Removes the unit from both `attachedUnit` and `availableUnits` collections
   - Ensures the unit is completely removed from dispatch visibility

2. **When status is anything else:**
   - Checks if the unit is currently attached to a call
   - If not attached and not in `availableUnits`, adds the unit to `availableUnits`
   - If already in `availableUnits`, updates the status and timestamp
   - Preserves attachment to calls (doesn't remove from `attachedUnit`)

### Updated Functions
- `handleStatusChange()`: Now calls `manageUnitCollections()` and adds timestamp
- `updateStatusAndButton()`: Now calls `manageUnitCollections()` and adds timestamp

### Collection Structure
Both collections now include:
- `unitId`: The unit's unique identifier
- `callsign`: The unit's callsign from the units collection
- `unitType`: The unit's type (e.g., "Ambulance")
- `status`: The current status
- `lastStatusUpdate`: Timestamp of the last status change

## Testing Scenarios

### Test 1: Unit Goes Unavailable
1. Set unit to "Available" or any other status
2. Check Firebase: Unit should be in `availableUnits` collection
3. Change status to "Unavailable"
4. Check Firebase: Unit should be removed from both collections

### Test 2: Unit Becomes Available
1. Set unit to "Unavailable" 
2. Check Firebase: Unit should not be in either collection
3. Change status to "Available"
4. Check Firebase: Unit should appear in `availableUnits` collection

### Test 3: Status Changes While Available
1. Set unit to "Available"
2. Change to "En Route" or another status
3. Check Firebase: Unit should remain in `availableUnits` with updated status

### Test 4: Attached Unit Changes Status
1. If unit is attached to a call (in `attachedUnit` collection)
2. Change status to anything except "Unavailable"
3. Check Firebase: Unit should remain in `attachedUnit`, not move to `availableUnits`

## Error Handling
- All collection management operations are wrapped in try-catch
- Errors are logged but don't interrupt the status update flow
- Status updates will still work even if collection management fails

## Benefits
- Automatic unit tracking across the system
- Proper cleanup when units go unavailable
- Real-time visibility for dispatchers
- Consistent data across all collections
