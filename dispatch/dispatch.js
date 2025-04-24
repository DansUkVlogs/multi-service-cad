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
  allCallsProxy.length = 0; // Clear the proxy array
  allCallsProxy.push(...calls); // Populate the proxy array

  displayCalls(allCallsProxy); // Dynamically update the calls list
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
  closeCallBtn.classList.remove('show'); // Hide the Close Call button
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
async function renderAttachedUnitsForCall(callId, attachedUnitIds) {
  const attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
  if (!attachedUnitsContainer) return;

  attachedUnitsContainer.innerHTML = ''; // Clear existing attached units

  if (!attachedUnitIds || attachedUnitIds.length === 0) {
    attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>'; // Show a message if no units are attached
    return;
  }

  for (const unitId of attachedUnitIds) {
    try {
      const unitRef = db.collection('units').doc(unitId);
      const unitSnap = await unitRef.get();

      if (!unitSnap || !unitSnap.data()) {
        continue;
      }

      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('attached-unit');
      unitDiv.dataset.unitId = unitId;
      unitDiv.style.backgroundColor = getStatusColor(unitData.status);
      unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status));
      unitDiv.textContent = `${unitData.callsign || 'N/A'} (${unitData.unitType || 'Unknown'})`;

      attachedUnitsContainer.appendChild(unitDiv);
    } catch (error) {
      console.error(`Error fetching unit details for ID ${unitId}:`, error);
    }
  }
}

// Display calls in the list
async function displayCalls(calls) {
  callsList.innerHTML = ''; // Clear previous list

  if (calls.length === 0) {
    callsList.innerHTML = '<p>No calls available.</p>';
    return;
  }

  // Sort calls by date and time (newest first)
  const sortedCalls = calls.sort((a, b) => {
    const dateA = new Date(a.timestamp);
    const dateB = new Date(b.timestamp);
    return dateB - dateA; // Descending order by date and time
  });

  for (const call of sortedCalls) {
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
          <p>No Attached Units</p> <!-- Default message for no attached units -->
        </div>
      </div>
    `;

    callCard.addEventListener('dblclick', () => selectCall(call));
    callsList.appendChild(callCard);

    // Render attached units for the call
    if (call.attachedUnits && Array.isArray(call.attachedUnits) && call.attachedUnits.length > 0) {
      await renderAttachedUnitsForCall(call.id, call.attachedUnits);
    }
  }
}

// Global variable to store the currently selected call ID
let selectedCallId = null;

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
    closeCallBtn.classList.add('show'); // Add the 'show' class to make the button visible

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

    // Populate description and dropdown in the Edit Call section
    const descriptionInput = document.getElementById('callDescription');
    const callTypeDropdown = document.getElementById('callTypeDropdown');
    descriptionInput.value = call.description || '';

    const dropdownOptions = await getDropdownOptions(call.service);
    callTypeDropdown.innerHTML = dropdownOptions
      .map(option => `<option value="${option.id}" ${call.callType === option.id ? 'selected' : ''}>${option.type}</option>`)
      .join('');

    // Clear and render attached units for the selected call
    attachedUnits.innerHTML = ''; // Clear the container to avoid duplicates
    await renderAttachedUnits(call.id);
  }
}

// Render available units in the "Manage Units" section
function renderUnitCards(units) {
  const availableUnitsList = document.getElementById('availableUnitsList');
  if (!availableUnitsList) return;

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
      <div class="unit-status" style="background-color: ${getStatusColor(status)}; color: ${getContrastingTextColor(status)};">
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

// Add event listener to the Close Call button
closeCallBtn.addEventListener('click', async () => {
  const selectedCallElement = document.querySelector('.selected-call');
  if (!selectedCallElement) {
    alert('No call is selected.');
    return;
  }

  const callId = selectedCallElement.dataset.callId;

  // Show confirmation popup
  const confirmClose = confirm('Are you sure you wish to close this call? This action cannot be undone.');
  if (confirmClose) {
    try {
      // Delete the call from Firestore
      await db.collection('calls').doc(callId).delete();

      // Update the allCallsProxy array
      allCallsProxy = allCallsProxy.filter(call => call.id !== callId);

      // Refresh the calls list to reflect the deletion
      displayCalls(allCallsProxy);

      // Clear the call details section
      clearCallDetails();
    } catch (error) {
      console.error('Failed to close the call:', error);
    }
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

    await attachUnit(unitId, callId);
  }
});

// Detach a unit from a call
document.getElementById('detachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'attached') {
    const unitId = selectedUnit.dataset.unitId;
    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) return;
    const callId = selectedCallElement.dataset.callId;
    await detachUnit(unitId, callId);
  }
});

// Save changes to the selected call
document.getElementById('saveCallDetails').addEventListener('click', async () => {
  if (!selectedCallId) {
    alert('No call is selected.');
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

    alert('Call details updated successfully.');
  } catch (error) {
    console.error('Error updating call details:', error);
    alert('Failed to update call details. Please try again.');
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
  attachedUnitsRef.onSnapshot(async (snapshot) => {
    const attachedUnits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Ensure allCallsProxy is populated before processing attached units
    if (allCallsProxy.length === 0) {
      return;
    }

    // Update the "All Calls" list with the latest attached units
    allCallsProxy = allCallsProxy.map(call => {
      const callAttachedUnits = attachedUnits.filter(unit => unit.callID === call.id);
      return { ...call, attachedUnits: callAttachedUnits.map(unit => unit.unitID) };
    });

    displayCalls(allCallsProxy); // Refresh the "All Calls" list

    // Reload the selected call's details and attached units if it is affected by the update
    if (selectedCallId) {
      const selectedCall = allCallsProxy.find(call => call.id === selectedCallId);
      if (selectedCall) {
        await renderAttachedUnits(selectedCallId); // Ensure attached units are updated in real-time
      }
    }
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

// Use getContrastingTextColor and other functions directly as they are globally accessible
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

    allCallsProxy.length = 0; // Clear the proxy array
    allCallsProxy.push(...updatedCalls); // Populate the proxy array with updated calls

    // Refresh the "All Calls" list and ensure attached units are re-rendered
    displayCalls(allCallsProxy);
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