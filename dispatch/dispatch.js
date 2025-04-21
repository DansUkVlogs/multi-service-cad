import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot, where, query, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getUnitTypeColor, getStatusColor, getContrastingTextColor } from './statusColor.js';

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
let selectedUnit = null;
let selectedUnitSection = null;

let dropdownOptionsCache = null;

// DOM elements for filters
const callServiceFilter = document.getElementById('callServiceFilter');
const unitTypeFilter = document.getElementById('unitTypeFilter');
const unitCallsignSearch = document.getElementById('unitCallsignSearch');

// Filtered calls and units
let allCalls = [];
let allUnits = [];

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
  const filteredCalls = selectedService === 'All' ? allCalls : allCalls.filter(call => call.service === selectedService);
  displayCalls(filteredCalls);
});

// Update the units list based on the selected type filter and callsign search
function filterUnits() {
  const selectedType = unitTypeFilter.value;
  const searchQuery = unitCallsignSearch.value.toLowerCase();

  const filteredUnits = allUnits.filter(unit => {
    const matchesType = selectedType === 'All' || unit.unitType === selectedType; // Fix "All" filter
    const matchesCallsign = unit.callsign?.toLowerCase().includes(searchQuery);
    return matchesType && matchesCallsign;
  });

  displayUnits(filteredUnits);
}

// Attach event listeners for unit filters
unitTypeFilter.addEventListener('change', filterUnits);
unitCallsignSearch.addEventListener('input', filterUnits);

// Load calls from Firestore
function loadCalls() {
  const callsRef = collection(db, 'calls');
  onSnapshot(callsRef, (snapshot) => {
    const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allCalls = calls; // Store all calls for filtering
    displayCalls(calls);

    // Refresh details of the selected call
    const selectedCallId = document.querySelector('.selected-call')?.dataset.callId;
    if (selectedCallId) {
      const selectedCall = calls.find(call => call.id === selectedCallId);
      if (selectedCall) {
        selectCall(selectedCall);
      } else {
        clearCallDetails(); // Clear details if the selected call no longer exists
      }
    } else {
      clearCallDetails(); // Clear details if no call is selected
    }
  });
}

// Display calls in the list
async function displayCalls(calls) {
  callsList.innerHTML = ''; // Clear previous list

  if (calls.length === 0) {
    callsList.innerHTML = '<p>No calls available.</p>';
    return;
  }

  for (const call of calls) {
    const callCard = document.createElement('div');
    callCard.classList.add('call-card');
    callCard.dataset.callId = call.id;

    const serviceColor = getUnitTypeColor(call.service);

    // Get the call type name from the dropdown options
    const dropdownOptions = await getDropdownOptions(call.service);
    const callTypeOption = dropdownOptions.find(option => option.id === call.callType);
    const callTypeName = callTypeOption ? `${callTypeOption.id} - ${callTypeOption.type}` : 'Awaiting Dispatch';

    callCard.innerHTML = `
      <div class="call-info">
        <p class="call-service" style="background-color: ${serviceColor};"><strong>Service:</strong> ${call.service || 'Service not provided'}</p>
        <p class="caller-name">${call.callerName || 'Unknown'}</p>
        <p class="call-location">${call.location || 'Location not provided'}</p>
        <p class="call-status"><strong>Status:</strong> ${callTypeName}</p>
        <div class="attached-units-container" id="attached-units-${call.id}">
          <!-- Attached units will be dynamically inserted here -->
        </div>
      </div>
    `;

    callCard.addEventListener('dblclick', () => selectCall(call));
    callsList.appendChild(callCard);

    // Render attached units for this call
    if (call.attachedUnits && Array.isArray(call.attachedUnits)) {
      renderAttachedUnitsInCallsList(call.id, call.attachedUnits);
    }
  }
}

// Render attached units in the call details section
async function renderAttachedUnits(callId, attachedUnitIds) {
  const attachedUnitsContainer = document.getElementById('attachedUnits');
  if (!attachedUnitsContainer) return;

  attachedUnitsContainer.innerHTML = ''; // Clear existing attached units

  const uniqueUnitIds = [...new Set(attachedUnitIds)]; // Ensure no duplicate unit IDs are processed

  // Fetch all unit data in parallel
  const unitPromises = uniqueUnitIds.map(async unitId => {
    const unitRef = doc(db, 'units', unitId);
    const unitSnap = await getDoc(unitRef);
    if (unitSnap.exists()) {
      return { id: unitId, ...unitSnap.data() };
    }
    return null;
  });

  const units = (await Promise.all(unitPromises)).filter(unit => unit !== null);

  // Render each unit
  units.forEach(unitData => {
    const unitDiv = document.createElement('div');
    unitDiv.classList.add('attached-unit');
    unitDiv.style.backgroundColor = getUnitTypeColor(unitData.unitType); // Use unit type color
    unitDiv.style.color = getContrastingTextColor(getUnitTypeColor(unitData.unitType)); // Adjust text color

    const statusDiv = document.createElement('div');
    statusDiv.classList.add('unit-status');
    statusDiv.style.backgroundColor = getStatusColor(unitData.status); // Use status color
    statusDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status)); // Adjust text color
    statusDiv.textContent = unitData.status;

    const callsignDiv = document.createElement('div');
    callsignDiv.textContent = `Callsign: ${unitData.callsign || 'N/A'}`;

    const unitTypeDiv = document.createElement('div');
    unitTypeDiv.textContent = `Type: ${unitData.unitType || 'Unknown'}`;

    unitDiv.appendChild(statusDiv);
    unitDiv.appendChild(callsignDiv);
    unitDiv.appendChild(unitTypeDiv);

    // Add click event to detach the unit
    unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'attached'));

    attachedUnitsContainer.appendChild(unitDiv);
  });
}

// Render attached units in the calls list
function renderAttachedUnitsInCallsList(callId, attachedUnitIds) {
  const attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
  if (!attachedUnitsContainer) return;

  attachedUnitsContainer.innerHTML = ''; // Clear existing attached units

  attachedUnitIds.forEach(async unitId => {
    const unitRef = doc(db, 'units', unitId);
    const unitSnap = await getDoc(unitRef);

    if (unitSnap.exists()) {
      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('attached-unit');
      unitDiv.style.backgroundColor = getStatusColor(unitData.status); // Dynamically set background color using status
      unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status)); // Adjust text color for readability
      unitDiv.textContent = `${unitData.callsign || 'N/A'} (${unitData.unitType || 'Unknown'})`; // Correct text format

      attachedUnitsContainer.appendChild(unitDiv);
    }
  });
}

// Display the selected call's details
async function selectCall(call) {
  const selectedCard = document.querySelector(`[data-call-id="${call.id}"]`);
  if (selectedCard) {
    // Highlight the selected call
    document.querySelectorAll('.selected-call').forEach(card => card.classList.remove('selected-call'));
    selectedCard.classList.add('selected-call');

    // Show the Close Call button
    closeCallBtn.style.display = 'inline-block';

    // Update call details
    callerName.textContent = call.callerName || 'Unknown';
    callLocation.textContent = call.location || 'Location not provided';
    callService.textContent = call.service || 'Service not provided';
    callStatus.textContent = call.status || 'Awaiting Dispatch';
    callTimestamp.textContent = call.timestamp ? new Date(call.timestamp.seconds * 1000).toLocaleString() : 'Timestamp not available';

    // Populate description and dropdown in the Edit Call section
    const descriptionInput = document.getElementById('callDescription');
    const callTypeDropdown = document.getElementById('callTypeDropdown');
    descriptionInput.value = call.description || '';

    // Populate dropdown options based on the service type
    const dropdownOptions = await getDropdownOptions(call.service);
    callTypeDropdown.innerHTML = dropdownOptions
      .map(option => `<option value="${option.id}" ${call.callType === option.id ? 'selected' : ''}>${option.type}</option>`)
      .join('');

    // Save changes to Firestore when the Save button is clicked
    document.getElementById('saveCallDetails').onclick = async () => {
      const updatedDescription = descriptionInput.value;
      const updatedCallType = callTypeDropdown.value;

      // Get the call type name for the selected call type
      const callTypeOption = dropdownOptions.find(option => option.id === updatedCallType);
      const updatedStatus = callTypeOption ? `${callTypeOption.id} - ${callTypeOption.type}` : 'Awaiting Dispatch';

      // Update Firestore with the new description, call type, and status
      await updateDoc(doc(db, 'calls', call.id), {
        description: updatedDescription,
        callType: updatedCallType,
        status: updatedStatus, // Update the status to match the selected call type
      });

      console.log(`Call ${call.id} updated: Description, Call Type, and Status saved.`);
    };

    // Render attached units
    if (call.attachedUnits && Array.isArray(call.attachedUnits)) {
      await renderAttachedUnitsList(call.attachedUnits);

      // Fetch all units and update the available units list
      const unitsSnapshot = await getDocs(collection(db, "units"));
      const allUnits = unitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      displayUnits(allUnits);
    }
  }
}

// Render attached units
async function renderAttachedUnitsList(attachedUnitIds) {
  attachedUnits.innerHTML = ''; // Clear existing attached units to prevent duplication

  const uniqueUnitIds = new Set(attachedUnitIds); // Ensure no duplicate unit IDs are processed

  for (const unitId of uniqueUnitIds) {
    const unitRef = doc(db, 'units', unitId);
    const unitSnap = await getDoc(unitRef);

    if (unitSnap.exists()) {
      const unitData = unitSnap.data();
      const sanitizedStatus = unitData.status.toLowerCase().replace(/\s+/g, '-'); // Replace spaces with hyphens
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('unit-card', sanitizedStatus); // Add sanitized status as a class
      unitDiv.dataset.unitId = unitId; // Ensure the data-unit-id attribute is set
      unitDiv.style.backgroundColor = getUnitTypeColor(unitData.unitType); // Use unit type color
      unitDiv.style.color = getContrastingTextColor(getUnitTypeColor(unitData.unitType)); // Adjust text color

      unitDiv.innerHTML = `
        <div class="unit-status" style="background-color: ${getStatusColor(unitData.status)}; color: ${getContrastingTextColor(getStatusColor(unitData.status))};">
          ${unitData.status}
        </div>
        <div class="unit-details">
          <p><strong>Callsign:</strong> ${unitData.callsign || 'N/A'}</p>
          <p><strong>Type:</strong> ${unitData.unitType || 'Unknown'}</p>
        </div>
      `;

      // Reapply click event listener for selecting attached units
      unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'attached'));
      attachedUnits.appendChild(unitDiv);
    }
  }
}

// Render unit cards in the manage units section
function renderUnitCards(units) {
  const availableUnitsList = document.getElementById('availableUnitsList');
  if (!availableUnitsList) return;

  availableUnitsList.innerHTML = ''; // Clear existing units

  // Filter units that are not attached to any call
  const unattachedUnits = units.filter(unit => !allCalls.some(call => call.attachedUnits?.includes(unit.id)));

  unattachedUnits.forEach(unitData => {
    const unitDiv = document.createElement('div');
    unitDiv.classList.add('unit-card');
    unitDiv.dataset.unitId = unitData.id; // Ensure the data-unit-id attribute is set correctly
    unitDiv.style.backgroundColor = getUnitTypeColor(unitData.unitType); // Use unit type color
    unitDiv.style.color = getContrastingTextColor(getUnitTypeColor(unitData.unitType)); // Adjust text color

    const statusDiv = document.createElement('div');
    statusDiv.classList.add('unit-status');
    statusDiv.style.backgroundColor = getStatusColor(unitData.status); // Use status color
    statusDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status)); // Adjust text color
    statusDiv.textContent = unitData.status;

    const callsignDiv = document.createElement('div');
    callsignDiv.textContent = `Callsign: ${unitData.callsign || 'N/A'}`;

    const unitTypeDiv = document.createElement('div');
    unitTypeDiv.textContent = `Type: ${unitData.unitType || 'Unknown'}`;

    unitDiv.appendChild(statusDiv);
    unitDiv.appendChild(callsignDiv);
    unitDiv.appendChild(unitTypeDiv);

    // Add click event to select the unit
    unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'manage'));

    availableUnitsList.appendChild(unitDiv);
  });
}

// Display available units
async function displayUnits(units) {
  renderUnitCards(units);
}

// Select a unit
function selectUnit(unitElement, section) {
  if (selectedUnit) selectedUnit.classList.remove('selected-unit');
  selectedUnit = unitElement;
  selectedUnitSection = section;
  selectedUnit.classList.add('selected-unit');
}

// Update the UI when no call is selected
function clearCallDetails() {
  callerName.textContent = '';
  callLocation.textContent = '';
  callService.textContent = '';
  callStatus.textContent = '';
  callTimestamp.textContent = '';
  attachedUnits.innerHTML = '<p>No Attached Units</p>';
  closeCallBtn.style.display = 'none'; // Hide the Close Call button
}

// Load all units
function loadUnits() {
  const unitsRef = collection(db, 'units');
  onSnapshot(unitsRef, (snapshot) => {
    const units = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allUnits = units; // Store all units for filtering
    displayUnits(units);
  });
}

// Add event listener to the Close Call button
closeCallBtn.addEventListener('click', async () => {
  const selectedCallElement = document.querySelector('.selected-call');
  if (!selectedCallElement) {
    console.error('No call is currently selected.');
    return;
  }

  const callId = selectedCallElement.dataset.callId;

  // Show confirmation popup
  const confirmClose = confirm('Are you sure you wish to end this call?');
  if (confirmClose) {
    try {
      // Delete the call from Firestore
      await deleteDoc(doc(db, 'calls', callId));
      console.log(`Call ${callId} has been closed.`);
    } catch (error) {
      console.error('Error closing the call:', error);
    }
  }
});

// Attach a unit to a call
document.getElementById('attachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'manage') {
    const unitId = selectedUnit.dataset.unitId; // Ensure this is correctly set
    if (!unitId) {
      console.error('Unit ID is undefined. Ensure the unit card has a valid data-unit-id attribute.');
      return;
    }

    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) {
      console.error('No call is currently selected.');
      return;
    }
    const callId = selectedCallElement.dataset.callId;

    const callRef = doc(db, 'calls', callId);
    const callSnap = await getDoc(callRef);

    if (callSnap.exists()) {
      const callData = callSnap.data();
      const attachedUnits = callData.attachedUnits || []; // Ensure attachedUnits is initialized as an array

      if (!attachedUnits.includes(unitId)) {
        attachedUnits.push(unitId);
        try {
          await updateDoc(callRef, { attachedUnits }); // Update Firestore with the new attached units
          console.log(`Unit ${unitId} attached to call ${callId}`);

          // Re-fetch the updated call and re-trigger selectCall
          const updatedCallSnap = await getDoc(callRef);
          const updatedCall = { id: updatedCallSnap.id, ...updatedCallSnap.data() };
          selectCall(updatedCall);
        } catch (error) {
          console.error('Error updating Firestore:', error);
        }
      }
    }
  }
});

document.getElementById('detachBtn').addEventListener('click', async () => {
  if (selectedUnit && selectedUnitSection === 'attached') {
    const unitId = selectedUnit.dataset.unitId;
    const selectedCallElement = document.querySelector('.selected-call');
    if (!selectedCallElement) {
      console.error('No call is currently selected.');
      return;
    }
    const callId = selectedCallElement.dataset.callId;

    const callRef = doc(db, 'calls', callId);
    const callSnap = await getDoc(callRef);

    if (callSnap.exists()) {
      const callData = callSnap.data();
      const attachedUnits = callData.attachedUnits || [];
      const updatedUnits = attachedUnits.filter(id => id !== unitId);

      await updateDoc(callRef, { attachedUnits: updatedUnits });
      console.log(`Unit ${unitId} detached from call ${callId}`);

      // Re-fetch the updated call and re-trigger selectCall
      const updatedCallSnap = await getDoc(callRef);
      const updatedCall = { id: updatedCallSnap.id, ...updatedCallSnap.data() };
      selectCall(updatedCall);
    }
  }
});

// Initial load
loadCalls();
loadUnits();