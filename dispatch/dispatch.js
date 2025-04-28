// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBWM3d9NXDzItCM4z3lZK2LC0z41tPw-bE",
  authDomain: "emergencycad-561d4.firebaseapp.com",
  projectId: "emergencycad-561d4",
  storageBucket: "emergencycad-561d4.firebasestorage.app",
  messagingSenderId: "573720799939",
  appId: "1:573720799939:web:5828efc1893892a4929076",
  measurementId: "G-XQ55M4GC92"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// DOM elements
const availableUnitsList = document.getElementById('availableUnitsList');
const attachedUnits = document.getElementById('attachedUnits');
const callsList = document.getElementById('callsList');
const callerName = document.getElementById('callerName');
const callLocation = document.getElementById('callLocation');
const callService = document.getElementById('callService');
const callStatus = document.getElementById('callStatus');
const callTimestamp = document.getElementById('callTimestamp');
const closeCallBtn = document.getElementById('closeCallBtn');
const callServiceDropdown = document.getElementById('callServiceDropdown');
let selectedUnit = null;
let selectedUnitSection = null;

let dropdownOptionsCache = null;

// DOM elements for filters
const callServiceFilter = document.getElementById('callServiceFilter');
const unitTypeFilter = document.getElementById('unitTypeFilter');
const unitCallsignSearch = document.getElementById('unitCallsignSearch');

// Filtered calls and units
let allCalls = [];
let allUnits = []; // Declare and initialize allUnits to store all units for filtering

// Proxy to monitor changes to allCalls
let allCallsProxy = [];
function initializeAllCallsListener() {
  allCallsProxy = new Proxy(allCalls, {
    set(target, property, value) {
      const selectedCallId = document.querySelector('.selected-call')?.dataset.callId;

      // Update the target array
      target[property] = value;

      // Check if the change affects the currently selected call
      if (selectedCallId) {
        const selectedCall = target.find(call => call.id === selectedCallId);
        if (selectedCall && property === target.indexOf(selectedCall).toString()) {
          renderAttachedUnits(selectedCallId); // Repopulate the attached units section
        }
      }

      return true;
    }
  });
}

// Firestore collections
const availableUnitsRef = db.collection('availableUnits');
const attachedUnitsRef = db.collection('attachedUnits');

// Fetch dropdown options from the JSON file
async function fetchDropdownOptions() {
  if (!dropdownOptionsCache) {
    const response = await fetch('../data/dropdownOptions.json');
    dropdownOptionsCache = await response.json();
  }
  return dropdownOptionsCache;
}

// Get dropdown options for a specific service
async function getDropdownOptions(service) {
  const options = await fetchDropdownOptions();
  return options[service] || [];
}

// Update the calls list based on the selected service filter
callServiceFilter.addEventListener('change', () => {
  const selectedService = callServiceFilter.value;
  const filteredCalls = selectedService === 'All' ? allCallsProxy : allCallsProxy.filter(call => call.service === selectedService);
  displayCalls(filteredCalls); // Ensure "All" filter works correctly
});

// Update the units list based on the selected type filter and callsign search
function filterUnits() {
  const selectedType = unitTypeFilter.value;
  const searchQuery = unitCallsignSearch.value.toLowerCase();

  const filteredUnits = allUnits.filter(unit => {
    const matchesType = selectedType === 'All' || unit.unitType === selectedType;
    const matchesCallsign = unit.callsign?.toLowerCase().includes(searchQuery);
    return matchesType && matchesCallsign;
  });

  renderUnitCards(filteredUnits);
}

// Attach event listeners for unit filters
unitTypeFilter.addEventListener('change', filterUnits);
unitCallsignSearch.addEventListener('input', filterUnits);

// Load calls from Firestore and listen for real-time updates
async function loadCalls() {
  const callsRef = db.collection('calls');
  const snapshot = await callsRef.get();

  const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const uniqueCalls = deduplicateCalls(calls); // Deduplicate calls

  allCallsProxy.length = 0; // Clear the proxy array
  allCallsProxy.push(...uniqueCalls); // Populate the proxy array with unique calls

  displayCalls(allCallsProxy); // Dynamically update the calls list
}

// Deduplicate calls by their ID
function deduplicateCalls(calls) {
  const uniqueCalls = new Map();
  calls.forEach(call => {
    uniqueCalls.set(call.id, call); // Use the call ID as the key to ensure uniqueness
  });
  return Array.from(uniqueCalls.values());
}

// Display calls in the list
let isRenderingCalls = false; // Flag to prevent overlapping renders
async function displayCalls(calls) {
  if (isRenderingCalls) return; // Prevent overlapping renders
  isRenderingCalls = true;

  callsList.innerHTML = ''; // Clear previous list

  if (calls.length === 0) {
    callsList.innerHTML = '<p>No calls available.</p>';
    isRenderingCalls = false;
    return;
  }

  // Sort calls by date and time (newest first)
  const sortedCalls = calls.sort((a, b) => {
    const dateA = new Date(a.timestamp);
    const dateB = new Date(b.timestamp);
    return dateB - dateA; // Descending order by date and time
  });

  const renderedCallIds = new Set(); // Track rendered call IDs to prevent duplicates

  for (const call of sortedCalls) {
    if (renderedCallIds.has(call.id)) continue; // Skip duplicate calls

    const callCard = document.createElement('div');
    callCard.classList.add('call-card');
    callCard.dataset.callId = call.id;

    const serviceColor = getUnitTypeColor(call.service);

    // Convert the timestamp to "HH:mm:ss DD/MM/YYYY" format
    let formattedTimestamp = 'Timestamp not available';
    if (call.timestamp) {
      const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
      formattedTimestamp = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
    }

    callCard.innerHTML = `
      <div class="call-info">
        <p class="call-service" style="background-color: ${serviceColor};"><strong>Service:</strong> ${call.service || 'Service not provided'}</p>
        <p class="caller-name">${call.callerName || 'Unknown'}</p>
        <p class="call-location">${call.location || 'Location not provided'}</p>
        <p class="call-status"><strong>Status:</strong> ${call.status || 'Awaiting Dispatch'}</p>
        <p class="call-timestamp"><strong>Time:</strong> ${formattedTimestamp}</p>
        <div class="attached-units-container" id="attached-units-${call.id}">
          <!-- Placeholder for attached units -->
        </div>
      </div>
    `;

    callCard.addEventListener('dblclick', () => selectCall(call));
    callsList.appendChild(callCard);

    // Dynamically fetch and render attached units for the call
    await renderAttachedUnitsForCall(call.id);
    renderedCallIds.add(call.id); // Mark this call as rendered
  }

  isRenderingCalls = false; // Reset the flag after rendering
}

// Render attached units in the "Attached Units" section
async function renderAttachedUnits(callId) {
  const attachedUnitsContainer = document.getElementById('attachedUnits');
  if (!attachedUnitsContainer) return;

  // Clear the container to prevent duplicate rendering
  attachedUnitsContainer.innerHTML = '';

  const attachedUnitQuery = attachedUnitsRef.where("callID", "==", callId);
  const attachedUnitSnapshot = await attachedUnitQuery.get();

  if (attachedUnitSnapshot.empty) {
    attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
    return;
  }

  const renderedUnitIds = new Set(); // Track rendered unit IDs to prevent duplicates

  attachedUnitsContainer.style.display = 'flex'; // Show the container if units are attached

  for (const docSnap of attachedUnitSnapshot.docs) {
    const { unitID } = docSnap.data();
    if (!unitID || renderedUnitIds.has(unitID)) continue; // Skip duplicates

    try {
      const unitRef = db.collection('units').doc(unitID);
      const unitSnap = await unitRef.get();

      if (!unitSnap || !unitSnap.data()) {
        continue;
      }

      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('unit-card');
      unitDiv.dataset.unitId = unitID;
      unitDiv.style.backgroundColor = getUnitTypeColor(unitData.unitType);
      unitDiv.style.color = getContrastingTextColor(getUnitTypeColor(unitData.unitType));

      unitDiv.innerHTML = `
        <div class="unit-status" style="background-color: ${getStatusColor(unitData.status)}; color: ${getContrastingTextColor(getStatusColor(unitData.status))};">
          ${unitData.status || 'Unknown'}
        </div>
        <div class="unit-details">
          <p><strong>Callsign:</strong> ${unitData.callsign}</p>
          <p><strong>Type:</strong> ${unitData.unitType}</p>
        </div>
      `;

      unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'attached'));
      attachedUnitsContainer.appendChild(unitDiv);

      renderedUnitIds.add(unitID); // Mark this unit as rendered
    } catch (error) {
      console.error(`Error fetching unit details for ID ${unitID}:`, error);
    }
  }

  // Remove duplicates after rendering
  removeDuplicateAttachedUnits();
}

// Render attached units under each call in the "All Calls" list
async function renderAttachedUnitsForCall(callId) {
  const attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
  if (!attachedUnitsContainer) return;

  // Fetch attached units for the given call ID from the attachedUnits collection
  const attachedUnitQuery = attachedUnitsRef.where("callID", "==", callId);
  const attachedUnitSnapshot = await attachedUnitQuery.get();

  // If no attached units exist, update the container with a placeholder message
  if (attachedUnitSnapshot.empty) {
    attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>'; // Update instead of removing
    return;
  }

  // Clear the container before rendering attached units
  attachedUnitsContainer.innerHTML = '';

  const renderedUnitIds = new Set(); // Track rendered unit IDs to prevent duplicates

  for (const docSnap of attachedUnitSnapshot.docs) {
    try {
      const { unitID } = docSnap.data();
      if (renderedUnitIds.has(unitID)) continue; // Skip duplicates

      const unitRef = db.collection('units').doc(unitID);
      const unitSnap = await unitRef.get();

      if (!unitSnap || !unitSnap.data()) {
        continue;
      }

      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('attached-unit'); // Corrected class name
      unitDiv.dataset.unitId = unitID;
      unitDiv.style.backgroundColor = getStatusColor(unitData.status);
      unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status));
      unitDiv.textContent = `${unitData.callsign || 'N/A'} (${unitData.unitType || 'Unknown'})`;

      attachedUnitsContainer.appendChild(unitDiv);
      renderedUnitIds.add(unitID); // Mark this unit as rendered
    } catch (error) {
      console.error(`Error fetching unit details for call ID ${callId}:`, error);
    }
  }
}

// Ensure getUnitTypeColor is globally accessible
function getUnitTypeColor(unitType) {
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

// Ensure only unique attached units are displayed
function removeDuplicateAttachedUnits() {
  const attachedUnitsContainer = document.getElementById('attachedUnits');
  if (!attachedUnitsContainer) return;

  const unitElements = Array.from(attachedUnitsContainer.children);
  const uniqueUnitIds = new Set();

  unitElements.forEach(unitElement => {
    const unitId = unitElement.dataset.unitId;
    if (uniqueUnitIds.has(unitId)) {
      unitElement.remove(); // Remove duplicate unit
    } else {
      uniqueUnitIds.add(unitId); // Add unique unit ID to the set
    }
  });
}

// Clear the call details section and hide the Close Call button
function clearCallDetails() {
  if (callerName) callerName.textContent = '';
  if (callLocation) callLocation.textContent = '';
  if (callService) callService.textContent = '';
  if (callStatus) callStatus.textContent = '';
  if (callTimestamp) callTimestamp.textContent = '';
  if (callServiceDropdown) callServiceDropdown.value = ''; // Reset to blank
  const callDescription = document.getElementById('callDescription');
  if (callDescription) callDescription.value = ''; // Clear description
  const callTypeDropdown = document.getElementById('callTypeDropdown');
  if (callTypeDropdown) callTypeDropdown.innerHTML = ''; // Clear call type dropdown
  if (attachedUnits) {
    attachedUnits.innerHTML = ''; // Clear attached units section
    attachedUnits.style.display = 'none'; // Hide the attached units container
  }
  closeCallBtn.classList.remove('show'); // Ensure the button is hidden
}

// Update the "Attached Units" section
function updateAttachedUnitsUI(units) {
  const attachedUnitsContainer = document.getElementById('attachedUnits');
  if (!attachedUnitsContainer) return;

  attachedUnitsContainer.innerHTML = ''; // Clear existing attached units

  units.forEach(unit => {
    const unitDiv = document.createElement('div');
    unitDiv.classList.add('attached-unit');
    unitDiv.dataset.unitId = unit.id;
    unitDiv.style.backgroundColor = getStatusColor(unit.status);
    unitDiv.style.color = getContrastingTextColor(getStatusColor(unit.status));
    unitDiv.textContent = `${unit.callsign || 'N/A'} (${unit.unitType || 'Unknown'})`;

    unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'attached'));
    attachedUnitsContainer.appendChild(unitDiv);
  });
}

// Select a unit
function selectUnit(unitElement, section) {
  if (selectedUnit) selectedUnit.classList.remove('selected-unit');
  selectedUnit = unitElement;
  selectedUnitSection = section;
  selectedUnit.classList.add('selected-unit');
}

// Move a unit from availableUnits to attachedUnits
async function attachUnit(unitId, callId) {
  try {
    // Search for the document in availableUnits where unitID matches the given unitId
    const querySnapshot = await availableUnitsRef.get();
    let unitDocId = null;

    querySnapshot.forEach(doc => {
      if (doc.data().unitID === unitId) {
        unitDocId = doc.id;
      }
    });

    if (!unitDocId) return;

    // Add the unit to the attachedUnits collection
    await attachedUnitsRef.doc(`${unitId}_${callId}`).set({ unitID: unitId, callID: callId });

    // Remove the unit from the availableUnits collection
    await availableUnitsRef.doc(unitDocId).delete();

    // Refresh the UI
    loadAvailableUnits();
    await renderAttachedUnits(callId);

    // Re-select the call to keep it selected
    const selectedCall = allCallsProxy.find(call => call.id === callId);
    if (selectedCall) {
      selectCall(selectedCall);
    }
  } catch (error) {
    console.error('Error attaching unit:', error);
  }
}

// Move a unit from attachedUnits to availableUnits
async function detachUnit(unitId, callId) {
  try {
    const unitDoc = attachedUnitsRef.doc(`${unitId}_${callId}`);
    const unitSnap = await unitDoc.get();

    if (!unitSnap || !unitSnap.data()) {
      return;
    }

    const unitData = unitSnap.data();

    // Add the unit back to the availableUnits collection
    await availableUnitsRef.doc(unitId).set({ unitID: unitId });

    // Remove the unit from the attachedUnits collection
    await unitDoc.delete();

    // Refresh the UI
    loadAvailableUnits();
    await renderAttachedUnits(callId);

    // Re-select the call to keep it selected
    const selectedCall = allCallsProxy.find(call => call.id === callId);
    if (selectedCall) {
      selectCall(selectedCall);
    }
  } catch (error) {
    console.error('Error detaching unit:', error);
  }
}

// Replace alert with showNotification for the Close Call button
closeCallBtn.addEventListener('click', async () => {
  const selectedCallElement = document.querySelector('.selected-call');
  if (!selectedCallElement) {
    showNotification('No call is selected.', 'error'); // Replaced alert
    return;
  }

  const callId = selectedCallElement.dataset.callId;

  // Show confirmation popup
  const confirmClose = confirm('Are you sure you wish to close this call? This action cannot be undone.');
  if (confirmClose) {
    try {
      // Fetch all attached units for the call
      const attachedUnitQuery = attachedUnitsRef.where("callID", "==", callId);
      const attachedUnitSnapshot = await attachedUnitQuery.get();

      // Move each attached unit back to the availableUnits collection
      for (const docSnap of attachedUnitSnapshot.docs) {
        const { unitID } = docSnap.data();
        if (unitID) {
          // Add the unit back to the availableUnits collection
          await availableUnitsRef.doc(unitID).set({ unitID });

          // Remove the unit from the attachedUnits collection
          await attachedUnitsRef.doc(`${unitID}_${callId}`).delete();
        }
      }

      // Delete the call from Firestore
      await db.collection('calls').doc(callId).delete();

      // Update the allCallsProxy array
      allCallsProxy = allCallsProxy.filter(call => call.id !== callId);

      // Refresh the calls list to reflect the deletion
      displayCalls(allCallsProxy);

      // Clear the call details section
      clearCallDetails();

      // Re-render attached units for all remaining calls
      for (const call of allCallsProxy) {
        if (call.attachedUnits && Array.isArray(call.attachedUnits)) {
          await renderAttachedUnitsForCall(call.id, call.attachedUnits);
        }
      }

      showNotification('Call closed successfully.', 'success'); // Replaced alert
    } catch (error) {
      console.error('Failed to close the call:', error);
      showNotification('Failed to close the call. Please try again.', 'error'); // Replaced alert
    }
  }
});

// Save changes to the selected call
document.getElementById('saveCallDetails').addEventListener('click', async () => {
  if (!selectedCallId) {
    showNotification('No call is selected.', 'error'); // Replaced alert
    return;
  }

  const descriptionInput = document.getElementById('callDescription');
  const callTypeDropdown = document.getElementById('callTypeDropdown');
  const callServiceDropdown = document.getElementById('callServiceDropdown');
  const callStatusSpan = document.getElementById('callStatus'); // Ensure this is editable or updated

  // Get the full text and code of the selected call type from the dropdown
  const selectedCallTypeCode = callTypeDropdown.value || '';
  const selectedCallTypeText = callTypeDropdown.options[callTypeDropdown.selectedIndex]?.text || '';
  const fullStatus = selectedCallTypeCode ? `${selectedCallTypeCode} - ${selectedCallTypeText}` : selectedCallTypeText;

  const updatedCallDetails = {
    description: descriptionInput.value || '',
    callType: selectedCallTypeCode, // Save the value (code) of the call type
    service: callServiceDropdown.value || 'Police',
    status: fullStatus || 'Awaiting Dispatch', // Save the full status (code + text)
  };

  try {
    // Update the call in Firestore
    await db.collection('calls').doc(selectedCallId).update(updatedCallDetails);

    // Update the UI to reflect the new status
    callStatusSpan.textContent = updatedCallDetails.status;

    // Reload the specific call from Firestore to ensure attached units are preserved
    const updatedCallDoc = await db.collection('calls').doc(selectedCallId).get();
    const updatedCall = {
      id: updatedCallDoc.id,
      ...updatedCallDoc.data(),
      timestamp: updatedCallDoc.data().timestamp?.toDate ? updatedCallDoc.data().timestamp.toDate() : updatedCallDoc.data().timestamp,
    };

    // Update the call in the proxy array
    const callIndex = allCallsProxy.findIndex(call => call.id === selectedCallId);
    if (callIndex !== -1) {
      allCallsProxy[callIndex] = updatedCall;
    }

    // Refresh the calls list to reflect the changes
    displayCalls(allCallsProxy);

    // Fetch attached units from Firestore and re-render them
    const attachedUnitQuery = attachedUnitsRef.where("callID", "==", selectedCallId);
    const attachedUnitSnapshot = await attachedUnitQuery.get();
    const attachedUnitIds = attachedUnitSnapshot.docs.map(doc => doc.data().unitID);

    if (attachedUnitIds.length > 0) {
      await renderAttachedUnitsForCall(selectedCallId, attachedUnitIds);
    } else {
      // Clear the "Attached Units" section if no units are attached
      const attachedUnitsContainer = document.getElementById('attachedUnits');
      attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
    }

    showNotification('Call details updated successfully.', 'success'); // Replaced alert
  } catch (error) {
    console.error('Error updating call details:', error);
    showNotification('Failed to update call details. Please try again.', 'error'); // Replaced alert
  }
});

// Attach a unit to a call
document.getElementById('attachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'manage') {
    const unitId = selectedUnit.dataset.unitId;
    if (!unitId) return;

    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) return;
    const callId = selectedCallElement.dataset.callId;

    try {
      await attachUnit(unitId, callId);
      showNotification('Unit attached successfully.', 'success'); // Replaced alert
    } catch (error) {
      console.error('Error attaching unit:', error);
      showNotification('Failed to attach unit. Please try again.', 'error'); // Replaced alert
    }
  }
});

// Detach a unit from a call
document.getElementById('detachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'attached') {
    const unitId = selectedUnit.dataset.unitId;
    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) return;
    const callId = selectedCallElement.dataset.callId;

    try {
      await detachUnit(unitId, callId);
      showNotification('Unit detached successfully.', 'success'); // Added notification
    } catch (error) {
      console.error('Error detaching unit:', error);
      showNotification('Failed to detach unit. Please try again.', 'error'); // Added error notification
    }
  }
});

// Load available units and fetch their details from the 'units' collection
function loadAvailableUnits() {
  availableUnitsRef.onSnapshot(async (snapshot) => {
    const availableUnitDocs = snapshot.docs.map(doc => doc.data());

    if (availableUnitDocs.length === 0) {
      renderUnitCards([]); // Clear the UI if no units are available
      return;
    }

    const availableUnits = [];

    for (const docData of availableUnitDocs) {
      const unitId = docData.unitID; // Use the unitID field to fetch unit details
      try {
        const unitRef = db.collection('units').doc(unitId); // Fetch unit details from the 'units' collection
        const unitSnap = await unitRef.get();

        if (!unitSnap || !unitSnap.data()) {
          console.warn(`Unit with ID ${unitId} not found in the 'units' collection.`);
          continue;
        }

        const unitData = { id: unitId, ...unitSnap.data() };
        availableUnits.push(unitData);
      } catch (error) {
        console.error(`Error fetching unit details for ID ${unitId}:`, error);
      }
    }

    allUnits = availableUnits; // Store all units for filtering
    renderUnitCards(availableUnits); // Render the fetched unit details
  }, (error) => {
    console.error('Error listening to availableUnits collection:', error);
  });
}

// Render available units in the "Manage Units" section
function renderUnitCards(units) {
  if (!availableUnitsList) {
    console.error('Available units list element not found.');
    return;
  }

  availableUnitsList.innerHTML = ''; // Clear existing units

  if (units.length === 0) {
    availableUnitsList.innerHTML = '<p>No available units to display.</p>'; // Show a message if no units are available
    return;
  }

  units.forEach(unit => {
    // Ensure unit data is valid before rendering
    const callsign = unit.callsign || 'N/A';
    const unitType = unit.unitType || 'Unknown';
    const status = unit.status || 'Unknown';

    const unitDiv = document.createElement('div');
    unitDiv.classList.add('unit-card');
    unitDiv.dataset.unitId = unit.id;
    unitDiv.style.backgroundColor = getUnitTypeColor(unitType);
    unitDiv.style.color = getContrastingTextColor(getUnitTypeColor(unitType));

    unitDiv.innerHTML = `
      <div class="unit-status" style="background-color: ${getStatusColor(status)}; color: ${getContrastingTextColor(getStatusColor(status))};">
        ${status}
      </div>
      <div class="unit-details">
        <p><strong>Callsign:</strong> ${callsign}</p>
        <p><strong>Type:</strong> ${unitType}</p>
      </div>
    `;

    unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'manage'));
    availableUnitsList.appendChild(unitDiv);
  });
}

// Listen for real-time updates to the units collection
function listenForUnitUpdates() {
  db.collection('units').onSnapshot(async (snapshot) => {
    const updatedUnits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Update the global units list
    allUnits = allUnits.map(unit => {
      const updatedUnit = updatedUnits.find(u => u.id === unit.id);
      return updatedUnit || unit;
    });

    // Refresh the "Manage Units" section
    renderUnitCards(allUnits);

    // Refresh the "Attached Units" section for the selected call
    if (selectedCallId) {
      const selectedCall = allCallsProxy.find(call => call.id === selectedCallId);
      if (selectedCall) {
        await renderAttachedUnits(selectedCall.id);
      }
    }

    // Refresh the attached units under each call in the "All Calls" list
    for (const call of allCallsProxy) {
      if (call.attachedUnits && Array.isArray(call.attachedUnits)) {
        await renderAttachedUnitsForCall(call.id, call.attachedUnits);
      }
    }
  });
}

// Listen for real-time updates to the attachedUnits collection
function listenForAttachedUnitUpdates() {
  attachedUnitsRef.onSnapshot(async () => {
    // Refresh the "All Calls" list to ensure attached units are updated dynamically
    displayCalls(allCallsProxy);
  });
}

// Listen for changes to the selected call ID in Firestore
function listenForSelectedCallUpdates() {
  const selectedCallRef = db.collection('selectedCall').doc('current');
  selectedCallRef.onSnapshot(async (docSnap) => {
    if (docSnap && docSnap.data()) {
      const { callId } = docSnap.data();

      // Find the call in the allCallsProxy list
      const selectedCall = allCallsProxy.find(call => call.id === callId);
      if (selectedCall) {
        // Highlight the selected call in the UI
        document.querySelectorAll('.selected-call').forEach(card => card.classList.remove('selected-call'));
        const selectedCard = document.querySelector(`[data-call-id="${callId}"]`);
        if (selectedCard) {
          selectedCard.classList.add('selected-call');
        }

        // Clear and re-render the attached units to avoid duplicates
        const attachedUnitsContainer = document.getElementById('attachedUnits');
        if (attachedUnitsContainer) attachedUnitsContainer.innerHTML = '';
        await renderAttachedUnits(callId);
      }
    }
  });
}

// Update the call details section dynamically
function updateCallDetails(call) {
  if (callerName) callerName.textContent = call.callerName || 'Unknown';
  if (callLocation) callLocation.textContent = call.location || 'Location not provided';
  if (callService) callService.textContent = call.service || 'Unknown';
  if (callStatus) callStatus.textContent = call.status || 'Awaiting Dispatch';
  if (callTimestamp) {
    callTimestamp.textContent = call.timestamp
      ? new Date(call.timestamp.seconds * 1000).toLocaleString()
      : 'Timestamp not available';
  }
  if (callServiceDropdown) callServiceDropdown.value = call.service || 'Police';
}

/**
 * Creates a notification container if it doesn't exist.
 * @returns {HTMLElement} The notification container element.
 */
function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notificationContainer';
  container.style.position = 'fixed';
  container.style.top = '70px'; // Adjusted to move it below the "Back to Home" button
  container.style.right = '10px';
  container.style.zIndex = '1000';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '10px';
  document.body.appendChild(container);
  return container;
}

/**
 * Displays a notification on the screen with slide-in and slide-out animations.
 * @param {string} message - The message to display.
 * @param {string} type - The type of notification ('success', 'error', 'info', etc.).
 */
function showNotification(message, type = 'info') {
  const notificationContainer = document.getElementById('notificationContainer') || createNotificationContainer();
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // Add basic styling for the notification
  notification.style.padding = '10px 15px';
  notification.style.borderRadius = '5px';
  notification.style.color = '#fff';
  notification.style.fontSize = '14px';
  notification.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
  notification.style.backgroundColor = getNotificationBackgroundColor(type);
  notification.style.transform = 'translateX(100%)'; // Start off-screen
  notification.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  notification.style.opacity = '0';

  // Append the notification and trigger the slide-in animation
  notificationContainer.appendChild(notification);
  setTimeout(() => {
    notification.style.transform = 'translateX(0)'; // Slide in
    notification.style.opacity = '1';
  }, 10);

  // Auto-remove the notification with a slide-out animation after 5 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)'; // Slide out
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300); // Remove after animation
  }, 5000);
}

/**
 * Returns the background color for a notification based on its type.
 * @param {string} type - The type of notification ('success', 'error', 'info', etc.).
 * @returns {string} The background color.
 */
function getNotificationBackgroundColor(type) {
  switch (type) {
    case 'success':
      return '#4CAF50'; // Green
    case 'error':
      return '#F44336'; // Red
    case 'info':
      return '#2196F3'; // Blue
    case 'warning':
      return '#FFC107'; // Yellow
    default:
      return '#333'; // Default dark gray
  }
}

// Update the call card background and text color based on status
function updateCallCardBackground(callCard, status) {
  const backgroundColor = getStatusColor(status);
  const textColor = getContrastingTextColor(backgroundColor);
  callCard.style.backgroundColor = backgroundColor;
  callCard.style.color = textColor;
}

function listenForCallUpdates() {
  const callsRef = db.collection('calls');
  callsRef.onSnapshot(snapshot => {
    const updatedCalls = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp, // Resolve Firestore Timestamp
      };
    });

    const uniqueCalls = deduplicateCalls(updatedCalls); // Deduplicate calls
    allCallsProxy.length = 0; // Clear the proxy array
    allCallsProxy.push(...uniqueCalls); // Populate the proxy array with unique calls

    displayCalls(allCallsProxy); // Refresh the "All Calls" list
  });
}

// Initialize real-time listeners
function initializeRealTimeListeners() {
  initializeAllCallsListener(); // Initialize the allCalls listener
  listenForCallUpdates(); // Listen for real-time updates to the calls collection
  listenForUnitUpdates(); // Ensure available units updates are handled
  listenForAttachedUnitUpdates(); // Ensure attached units updates are handled
  listenForSelectedCallUpdates(); // Ensure selected call updates are synchronized
  loadAvailableUnits();
}

// Example usage of Firebase Firestore
function fetchCalls() {
  db.collection('calls')
    .get()
    .then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        console.log(doc.id, " => ", doc.data());
      });
    })
    .catch((error) => {
      console.error("Error fetching calls: ", error);
    });
}

// Call the function to fetch calls
fetchCalls();

// Initial load
initializeRealTimeListeners();
clearCallDetails(); // Ensure call details and attached units are cleared on page load

// Update the call type dropdown when the service is changed
callServiceDropdown.addEventListener('change', async () => {
  const selectedService = callServiceDropdown.value;

  // Fetch the dropdown options for the selected service
  const dropdownOptions = await getDropdownOptions(selectedService);

  // Update the call type dropdown with the new options
  const callTypeDropdown = document.getElementById('callTypeDropdown');
  if (callTypeDropdown) {
    callTypeDropdown.innerHTML = dropdownOptions
      .map(option => `<option value="${option.id}">${option.type}</option>`)
      .join('');
  }
});

// Global variable to store the currently selected call ID
let selectedCallId = null; // Ensure this is declared and initialized

// Display the selected call's details
async function selectCall(call) {
  const selectedCard = document.querySelector(`[data-call-id="${call.id}"]`);
  if (selectedCard) {
    // Highlight the selected call
    document.querySelectorAll('.selected-call').forEach(card => card.classList.remove('selected-call'));
    selectedCard.classList.add('selected-call');

    // Prevent re-rendering if the same call is selected again
    if (selectedCallId === call.id) {
      return;
    }
    selectedCallId = call.id;

    // Store the selected call ID in Firestore
    await db.collection('selectedCall').doc('current').set({ callId: call.id });

    // Show the Close Call button
    closeCallBtn.classList.add('show'); // Ensure the button is visible

    // Populate call details
    callerName.textContent = call.callerName || 'Unknown';
    callLocation.textContent = call.location || 'Location not provided';
    callStatus.textContent = call.status || 'Awaiting Dispatch';

    // Handle the timestamp
    let formattedTimestamp = 'Timestamp not available';
    if (call.timestamp) {
      const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
      formattedTimestamp = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
    }
    callTimestamp.textContent = formattedTimestamp;

    // Populate and style the service dropdown
    callServiceDropdown.value = call.service || 'Police';
    callServiceDropdown.setAttribute('data-service', call.service || 'Police');

    // Populate the description field
    const callDescription = document.getElementById('callDescription');
    if (callDescription) {
      callDescription.value = call.description || ''; // Set the description or leave it blank
    }

    // Populate the call type dropdown
    const callTypeDropdown = document.getElementById('callTypeDropdown');
    if (callTypeDropdown) {
      const dropdownOptions = await getDropdownOptions(call.service || 'Police');
      callTypeDropdown.innerHTML = dropdownOptions
        .map(option => `<option value="${option.id}" ${option.id === call.callType ? 'selected' : ''}>${option.type}</option>`)
        .join('');
    }

    // Clear and render attached units for the selected call
    attachedUnits.innerHTML = ''; // Clear the container to avoid duplicates
    await renderAttachedUnits(call.id);
  }
}