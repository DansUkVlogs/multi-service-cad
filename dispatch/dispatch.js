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
  const uniqueCalls = deduplicateCalls([...allCallsProxy, ...calls]); // Merge new calls with existing ones

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

  const previousSelectedCallId = selectedCallId; // Store the currently selected call ID

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

    // Highlight the previously selected call
    if (call.id === previousSelectedCallId) {
      callCard.classList.add('selected-call');
    }

    // Dynamically fetch and render attached units for the call
    await renderAttachedUnitsForCall(call.id);
    renderedCallIds.add(call.id); // Mark this call as rendered
  }

  isRenderingCalls = false; // Reset the flag after rendering
}

// Remove duplicate attached units
function removeDuplicateAttachedUnits(container) {
  const unitElements = Array.from(container.children);
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

  try {
    // Query the attachedUnits collection for all documents with the given callID
    const attachedUnitQuery = attachedUnitsRef.where("callID", "==", callId);
    const attachedUnitSnapshot = await attachedUnitQuery.get();

    if (attachedUnitSnapshot.empty) {
      attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
      return;
    }

    attachedUnitsContainer.style.display = 'flex'; // Show the container if units are attached

    for (const docSnap of attachedUnitSnapshot.docs) {
      const { unitID } = docSnap.data(); // Use `unitID` for attachedUnits

      if (!unitID) {
        console.warn(`Skipping attached unit with missing unitID for callID: ${callId}. Data:`, docSnap.data());
        continue; // Skip if `unitID` is missing
      }

      try {
        const unitRef = db.collection('units').doc(unitID); // Fetch unit details from the 'units' collection
        const unitSnap = await unitRef.get();

        if (!unitSnap.exists) {
          console.warn(`Unit with ID ${unitID} not found in the 'units' collection.`);
          continue; // Skip if the unit does not exist
        }

        const unitData = unitSnap.data();

        if (!unitData.callsign || !unitData.unitType) {
          console.warn(`Skipping unit with incomplete data: ${unitID}. Data:`, unitData);
          continue; // Skip if essential data is missing
        }

        // Create a unit card for each attached unit
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
      } catch (error) {
        console.error(`Error fetching unit details for ID ${unitID}:`, error);
      }
    }

    // Remove duplicates
    removeDuplicateAttachedUnits(attachedUnitsContainer);
  } catch (error) {
    console.error(`Error fetching attached units for call ID ${callId}:`, error);
    attachedUnitsContainer.innerHTML = '<p>Error loading attached units.</p>';
  }
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
      const { unitID } = docSnap.data(); // Use `unitID` for attachedUnits
      if (renderedUnitIds.has(unitID)) continue; // Skip duplicates

      const unitRef = db.collection('units').doc(unitID);
      const unitSnap = await unitRef.get();

      if (!unitSnap || !unitSnap.data()) {
        continue;
      }

      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('attached-unit');
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

  // Remove duplicates
  removeDuplicateAttachedUnits(attachedUnitsContainer);
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
    // Search for the document in availableUnits where unitId matches the given unitId
    const querySnapshot = await availableUnitsRef.get();
    let unitDocId = null;

    querySnapshot.forEach(doc => {
      if (doc.data().unitId === unitId) {
        unitDocId = doc.id;
      }
    });

    if (!unitDocId) {
      console.warn(`Unit with ID ${unitId} not found in availableUnits.`);
      return;
    }

    // Add the unit to the attachedUnits collection
    await attachedUnitsRef.doc(`${unitId}_${callId}`).set({ unitID: unitId, callID: callId });

    // Remove the unit from the availableUnits collection
    await availableUnitsRef.doc(unitDocId).delete();

    // Refresh the UI
    await renderAttachedUnits(callId); // Update the "Attached Units" section
    await renderAttachedUnitsForCall(callId); // Update the "All Calls" list
    await loadAvailableUnits(); // Ensure the "Manage Units" section is updated

    console.log(`Unit ${unitId} attached to call ${callId}.`);
  } catch (error) {
    console.error('Error attaching unit:', error);
  }
}

// Move a unit from attachedUnits to availableUnits
async function detachUnit(unitId, callId) {
  try {
    const unitDoc = attachedUnitsRef.doc(`${unitId}_${callId}`);
    const unitSnap = await unitDoc.get();

    if (!unitSnap.exists) {
      console.warn(`Unit with ID ${unitId} not found in attachedUnits for call ${callId}.`);
      return;
    }

    // Add the unit back to the availableUnits collection
    await availableUnitsRef.add({ unitId });

    // Remove the unit from the attachedUnits collection
    await unitDoc.delete();

    // Refresh the UI
    await renderAttachedUnits(callId); // Update the "Attached Units" section
    await renderAttachedUnitsForCall(callId); // Update the "All Calls" list
    await loadAvailableUnits(); // Ensure the "Manage Units" section is updated

    console.log(`Unit ${unitId} detached from call ${callId}.`);
  } catch (error) {
    console.error('Error detaching unit:', error);
  }
}

// Listen for real-time updates to the calls collection
function listenForCallUpdates() {
  const callsRef = db.collection('calls');
  callsRef.onSnapshot(async (snapshot) => {
    const updatedCalls = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp, // Resolve Firestore Timestamp
      };
    });

    const uniqueCalls = deduplicateCalls(updatedCalls); // Deduplicate calls

    // Sort calls by timestamp in descending order (newest first)
    uniqueCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    allCallsProxy.length = 0; // Clear the proxy array
    allCallsProxy.push(...uniqueCalls); // Populate the proxy array with unique calls

    displayCalls(allCallsProxy); // Refresh the "All Calls" list
  });
}

// Listen for real-time updates to the availableUnits collection
function listenForUnitUpdates() {
  const availableUnitsRef = db.collection('availableUnits');
  availableUnitsRef.onSnapshot(snapshot => {
    const updatedUnits = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    allUnits = updatedUnits; // Update the global units array
    renderUnitCards(allUnits); // Refresh the "Available Units" section
  });
}

// Listen for real-time updates to the attachedUnits collection
function listenForAttachedUnitUpdates() {
  attachedUnitsRef.onSnapshot(snapshot => {
    const changes = snapshot.docChanges();

    changes.forEach(change => {
      const { callID } = change.doc.data();

      if (change.type === 'added' || change.type === 'removed') {
        // Update the attached units for the specific call in the "All Calls" list
        renderAttachedUnitsForCall(callID);
      }
    });

    // Update the "Attached Units" section for the currently selected call
    const selectedCallElement = document.querySelector('.selected-call');
    if (selectedCallElement) {
      const callId = selectedCallElement.dataset.callId;
      if (callId) {
        renderAttachedUnits(callId); // Ensure the attached units section is updated
      }
    }
  });
}

// Initialize real-time listeners for Firestore updates
function initializeRealTimeListeners() {
  listenForCallUpdates(); // Ensure real-time updates for calls
  listenForUnitUpdates(); // Listen for real-time updates to the availableUnits collection
  listenForAttachedUnitUpdates(); // Listen for real-time updates to the attachedUnits collection
}

// Global variable to store the currently selected call ID
let selectedCallId = null; // Ensure this is declared and initialized

// Ensure no call is selected when the page loads
function clearSelectedCall() {
  selectedCallId = null;
  document.querySelectorAll('.selected-call').forEach(card => card.classList.remove('selected-call'));
  clearCallDetails(); // Clear the call details section
}

// Initial load
initializeRealTimeListeners();
clearSelectedCall(); // Ensure no call is selected on page load
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

// DOM elements for Add Call functionality
const addCallBtn = document.getElementById('addCallBtn');
const addCallModal = document.getElementById('addCallModal');
const addCallForm = document.getElementById('addCallForm');
const closeAddCallModal = addCallModal.querySelector('.close');
const serviceDropdown = document.getElementById('service');
const callTypeDropdown = document.getElementById('callType');

// Show the Add Call modal
addCallBtn.addEventListener('click', () => {
  addCallModal.style.display = 'block';
});

// Close the Add Call modal
closeAddCallModal.addEventListener('click', () => {
  addCallModal.style.display = 'none';
});

// Populate call type dropdown based on selected service
serviceDropdown.addEventListener('change', async () => {
  const selectedService = serviceDropdown.value;
  const dropdownOptions = await getDropdownOptions(selectedService);

  callTypeDropdown.innerHTML = dropdownOptions
    .map(option => `<option value="${option.id}">${option.type}</option>`)
    .join('');
});

// Handle Add Call form submission
addCallForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const callerName = "DISPATCH GENERATED"; // Set callerName to "DISPATCH GENERATED"
  const description = addCallForm.description.value;
  const location = addCallForm.location.value;
  const service = addCallForm.service.value;
  const callType = addCallForm.callType.value;

  try {
    // Add the new call to the Firestore "calls" collection
    await db.collection('calls').add({
      callerName,
      description,
      location,
      service,
      callType,
      status: `${callType}-${callTypeDropdown.options[callTypeDropdown.selectedIndex].text}`,
      timestamp: new Date(),
    });

    showNotification('New call added successfully.', 'success');
    addCallModal.style.display = 'none';
    await loadCalls(); // Explicitly reload the calls list
  } catch (error) {
    console.error('Error adding new call:', error);
    showNotification('Failed to add new call. Please try again.', 'error');
  }
});

// Close modal when clicking outside of it
window.addEventListener('click', (e) => {
  if (e.target === addCallModal) {
    addCallModal.style.display = 'none';
  }
});

// Select a call and update the call details section
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

    // Remove Firestore update to prevent synchronization across instances
    // await db.collection('selectedCall').doc('current').set({ callId: call.id });

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

// Close the selected call
closeCallBtn.addEventListener('click', async () => {
  if (!selectedCallId) {
    showNotification('No call is selected.', 'error');
    return;
  }

  try {
    // Remove the call from the "calls" collection
    await db.collection('calls').doc(selectedCallId).delete();

    // Move all attached units back to available units
    const attachedUnitQuery = attachedUnitsRef.where("callID", "==", selectedCallId);
    const attachedUnitSnapshot = await attachedUnitQuery.get();

    for (const docSnap of attachedUnitSnapshot.docs) {
      const { unitID } = docSnap.data();
      if (unitID) {
        // Add the unit back to the availableUnits collection
        await availableUnitsRef.add({ unitId: unitID });

        // Remove the unit from the attachedUnits collection
        await attachedUnitsRef.doc(docSnap.id).delete();
      }
    }

    // Refresh the UI
    selectedCallId = null;
    clearSelectedCall();
    await loadCalls(); // Explicitly reload the calls list
    await loadAvailableUnits();

    showNotification('Call closed successfully.', 'success');
  } catch (error) {
    console.error('Error closing call:', error);
    showNotification('Failed to close the call. Please try again.', 'error');
  }
});

// Attach a unit to a call
document.getElementById('attachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'manage') {
    const unitId = selectedUnit.dataset.unitId;
    if (!unitId) {
      showNotification('No unit selected or unit ID is missing.', 'error');
      return;
    }

    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) {
      showNotification('No call is selected.', 'error');
      return;
    }

    const callId = selectedCallElement.dataset.callId;
    if (!callId) {
      showNotification('Selected call does not have a valid call ID.', 'error');
      return;
    }

    try {
      await attachUnit(unitId, callId);
      showNotification('Unit attached successfully.', 'success');
    } catch (error) {
      console.error('Error attaching unit:', error);
      showNotification('Failed to attach unit. Please try again.', 'error');
    }
  } else {
    showNotification('No unit selected or the selected unit is not in the "manage" section.', 'error');
  }
});

// Detach a unit from a call
document.getElementById('detachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'attached') {
    const unitId = selectedUnit.dataset.unitId;
    if (!unitId) {
      showNotification('No unit selected or unit ID is missing.', 'error');
      return;
    }

    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) {
      showNotification('No call is selected.', 'error');
      return;
    }

    const callId = selectedCallElement.dataset.callId;
    if (!callId) {
      showNotification('Selected call does not have a valid call ID.', 'error');
      return;
    }

    try {
      await detachUnit(unitId, callId);
      showNotification('Unit detached successfully.', 'success');
    } catch (error) {
      console.error('Error detaching unit:', error);
      showNotification('Failed to detach unit. Please try again.', 'error');
    }
  } else {
    showNotification('No unit selected or the selected unit is not in the "attached" section.', 'error');
  }
});

// Save changes to the selected call
document.getElementById('saveCallDetails').addEventListener('click', async () => {
  if (!selectedCallId) {
    showNotification('No call is selected.', 'error');
    return;
  }

  try {
    const callDescription = document.getElementById('callDescription').value;
    const callTypeDropdown = document.getElementById('callTypeDropdown');
    const callType = callTypeDropdown.value;
    const callTypeText = callTypeDropdown.options[callTypeDropdown.selectedIndex].text;
    const callServiceDropdown = document.getElementById('callServiceDropdown').value;

    // Construct the new status using the call type and its description
    const newStatus = `${callType}-${callTypeText}`;

    // Update the call in the "calls" collection
    await db.collection('calls').doc(selectedCallId).update({
      description: callDescription,
      callType: callType,
      service: callServiceDropdown,
      status: newStatus,
    });

    showNotification('Call details saved successfully.', 'success');

    // Refresh the calls list and ensure the selected call remains selected
    await loadCalls();
    const selectedCard = document.querySelector(`[data-call-id="${selectedCallId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('selected-call');
    }
  } catch (error) {
    console.error('Error saving call details:', error);
    showNotification('Failed to save call details. Please try again.', 'error');
  }
});

// Load available units and fetch their details from the 'availableUnits' collection
async function loadAvailableUnits() {
  try {
    const snapshot = await availableUnitsRef.get();
    const availableUnitDocs = snapshot.docs.map(doc => doc.data());

    if (availableUnitDocs.length === 0) {
      renderUnitCards([]); // Clear the UI if no units are available
      return;
    }

    const availableUnits = [];

    for (const docData of availableUnitDocs) {
      const unitId = docData.unitId; // Use `unitId` for availableUnits

      if (!unitId) {
        console.warn(`Skipping document with missing unitId:`, docData);
        continue; // Skip if `unitId` is missing
      }

      try {
        const unitRef = db.collection('units').doc(unitId); // Fetch unit details from the 'units' collection
        const unitSnap = await unitRef.get();

        if (!unitSnap.exists) {
          console.warn(`Unit with ID ${unitId} not found in the 'units' collection.`);
          continue; // Skip if the unit does not exist
        }

        const unitData = { id: unitId, ...unitSnap.data() };
        availableUnits.push(unitData);
      } catch (error) {
        console.error(`Error fetching unit details for ID ${unitId}:`, error);
      }
    }

    allUnits = availableUnits; // Store all units for filtering
    renderUnitCards(availableUnits); // Render the fetched unit details
  } catch (error) {
    console.error('Error fetching availableUnits collection:', error);
  }
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

// Function to display notifications
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`; // Add a class based on the type (e.g., 'success', 'error')
  notification.textContent = message;

  // Add the notification to the body
  document.body.appendChild(notification);

  // Automatically remove the notification after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}