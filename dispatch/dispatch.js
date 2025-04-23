import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, getDocs, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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
          console.log(`Attached units changed for selected call: ${selectedCallId}`);
          renderAttachedUnits(selectedCallId); // Repopulate the attached units section
        }
      }

      return true;
    }
  });
}

// Firestore collections
const availableUnitsRef = collection(db, 'availableUnits');
const attachedUnitsRef = collection(db, 'attachedUnits');

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
function loadCalls() {
  const callsRef = collection(db, 'calls');
  onSnapshot(callsRef, async (snapshot) => {
    const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Fetch attached units for each call during the initial load
    for (const call of calls) {
      const attachedUnitQuery = query(attachedUnitsRef, where("callID", "==", call.id));
      const attachedUnitSnapshot = await getDocs(attachedUnitQuery);
      call.attachedUnits = attachedUnitSnapshot.docs.map(doc => doc.data().unitID);
    }

    allCallsProxy.length = 0; // Clear the proxy array
    allCallsProxy.push(...calls); // Populate the proxy array
    console.log("Loaded allCalls:", allCallsProxy); // Debugging log to verify allCalls is populated

    displayCalls(allCallsProxy); // Dynamically update the calls list

    // Reload the selected call's details if it still exists
    const selectedCallId = document.querySelector('.selected-call')?.dataset.callId;
    if (selectedCallId) {
      const selectedCall = allCallsProxy.find(call => call.id === selectedCallId);
      if (selectedCall) {
        selectCall(selectedCall); // Reload the entire call details section
      } else {
        clearCallDetails(); // Clear details if the selected call no longer exists
      }
    } else {
      clearCallDetails(); // Clear details if no call is selected
    }
  });
}

// Clear the call details section
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
  if (closeCallBtn) closeCallBtn.style.display = 'none'; // Hide the Close Call button
}

// Render attached units in the "Attached Units" section
async function renderAttachedUnits(callId) {
  const attachedUnitsContainer = document.getElementById('attachedUnits');
  if (!attachedUnitsContainer) return;

  attachedUnitsContainer.innerHTML = ''; // Clear existing attached units

  // Query the attachedUnits collection for all documents with the given callID
  const attachedUnitQuery = query(attachedUnitsRef, where("callID", "==", callId));
  const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

  if (attachedUnitSnapshot.empty) {
    attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
    return;
  }

  attachedUnitsContainer.style.display = 'flex'; // Show the container if units are attached

  // Iterate through each document in the query result
  for (const docSnap of attachedUnitSnapshot.docs) {
    const { unitID } = docSnap.data(); // Extract the unitID from the document

    if (!unitID) continue;

    try {
      // Fetch the full unit details from the 'units' collection using the unitID
      const unitRef = doc(db, 'units', unitID);
      const unitSnap = await getDoc(unitRef);

      if (!unitSnap.exists()) continue;

      const unitData = unitSnap.data();

      if (!unitData.callsign || !unitData.unitType) continue;

      // Log the callsign of the unit being added
      console.log(`Adding unit to attached units: Callsign = ${unitData.callsign}`);

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
      const unitRef = doc(db, 'units', unitId); // Fetch unit details from the 'units' collection
      const unitSnap = await getDoc(unitRef);

      if (unitSnap.exists()) {
        const unitData = unitSnap.data();
        const unitDiv = document.createElement('div');
        unitDiv.classList.add('attached-unit'); // Use the current style for attached units under calls
        unitDiv.dataset.unitId = unitId;
        unitDiv.style.backgroundColor = getStatusColor(unitData.status);
        unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status));
        unitDiv.textContent = `${unitData.callsign || 'N/A'} (${unitData.unitType || 'Unknown'})`;

        attachedUnitsContainer.appendChild(unitDiv);
      }
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

    // Render attached units for this call (fix for mini unit cards not showing on page load)
    if (call.attachedUnits && Array.isArray(call.attachedUnits)) {
      await renderAttachedUnitsForCall(call.id, call.attachedUnits);
    }
  }

  // Refresh the selected call's details if a call is currently selected
  if (selectedCallId) {
    const selectedCall = calls.find(call => call.id === selectedCallId);
    if (selectedCall) {
      selectCall(selectedCall); // Reload the selected call's details
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

    console.log("Selected call card:", selectedCard); // Debugging log for selected card
    console.log("Selected call ID:", selectedCard.dataset.callId); // Debugging log for call ID

    // Update the global selectedCallId
    selectedCallId = call.id;

    // Store the selected call ID in Firestore
    await setDoc(doc(db, 'selectedCall', 'current'), { callId: call.id });

    // Show the Close Call button
    callerName.textContent = call.callerName || 'Unknown';
    callLocation.textContent = call.location || 'Location not provided';
    callStatus.textContent = call.status || 'Awaiting Dispatch';
    callTimestamp.textContent = call.timestamp ? new Date(call.timestamp.seconds * 1000).toLocaleString() : 'Timestamp not available';

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

    // Render attached units for the selected call
    console.log("(UPDATING ATTACHED UNITS) Rendering attached units for call:", call.id);
    await renderAttachedUnits(call.id);

    // Save changes to Firestore when the Save button is clicked
    document.getElementById('saveCallDetails').onclick = async () => {
      const updatedDescription = descriptionInput.value;
      const updatedCallType = callTypeDropdown.value;
      const updatedService = callServiceDropdown.value;

      const callTypeOption = dropdownOptions.find(option => option.id === updatedCallType);
      const updatedStatus = callTypeOption ? `${callTypeOption.id} - ${callTypeOption.type}` : 'Awaiting Dispatch';

      // Update Firestore with the new description, call type, service, and status
      await updateDoc(doc(db, 'calls', call.id), {
        description: updatedDescription,
        callType: updatedCallType,
        service: updatedService,
        status: updatedStatus,
      });
    };
  } else {
    console.warn("No call card found for call ID:", call.id); // Warn if no call card is found
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
    const querySnapshot = await getDocs(availableUnitsRef);
    let unitDocId = null;

    querySnapshot.forEach(doc => {
      if (doc.data().unitID === unitId) {
        unitDocId = doc.id;
      }
    });

    if (!unitDocId) return;

    // Add the unit to the attachedUnits collection
    await setDoc(doc(attachedUnitsRef, `${unitId}_${callId}`), { unitID: unitId, callID: callId });

    // Remove the unit from the availableUnits collection
    await deleteDoc(doc(availableUnitsRef, unitDocId));

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
    const unitDoc = doc(attachedUnitsRef, `${unitId}_${callId}`);
    const unitSnap = await getDoc(unitDoc);

    if (unitSnap.exists()) {
      const unitData = unitSnap.data();

      // Add the unit back to the availableUnits collection
      await setDoc(doc(availableUnitsRef, unitId), { unitID: unitId });

      // Remove the unit from the attachedUnits collection
      await deleteDoc(unitDoc);

      // Refresh the UI
      loadAvailableUnits();
      await renderAttachedUnits(callId);

      // Re-select the call to keep it selected
      const selectedCall = allCallsProxy.find(call => call.id === callId);
      if (selectedCall) {
        selectCall(selectedCall);
      }
    }
  } catch (error) {
    console.error('Error detaching unit:', error);
  }
}

// Add event listener to the Close Call button
closeCallBtn.addEventListener('click', async () => {
  const selectedCallElement = document.querySelector('.selected-call');
  if (!selectedCallElement) return;

  const callId = selectedCallElement.dataset.callId;

  // Show confirmation popup
  const confirmClose = confirm('Are you sure you wish to end this call?');
  if (confirmClose) {
    try {
      // Delete the call from Firestore
      await deleteDoc(doc(db, 'calls', callId));
    } catch (error) {
      console.error('Error closing the call:', error);
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

// Load available units and fetch their details from the 'units' collection
function loadAvailableUnits() {
  onSnapshot(availableUnitsRef, async (snapshot) => {
    const availableUnitDocs = snapshot.docs.map(doc => doc.data());

    if (availableUnitDocs.length === 0) {
      renderUnitCards([]); // Clear the UI if no units are available
      return;
    }

    const availableUnits = [];

    for (const docData of availableUnitDocs) {
      const unitId = docData.unitID; // Use the unitID field to fetch unit details
      try {
        const unitRef = doc(db, 'units', unitId); // Fetch unit details from the 'units' collection
        const unitSnap = await getDoc(unitRef);

        if (unitSnap.exists()) {
          const unitData = { id: unitId, ...unitSnap.data() };
          availableUnits.push(unitData);
        }
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
  onSnapshot(collection(db, 'units'), async (snapshot) => {
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
  onSnapshot(attachedUnitsRef, async (snapshot) => {
    console.log("Attached units snapshot received:", snapshot.docs.map(doc => doc.data())); // Log changes

    const attachedUnits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Ensure allCallsProxy is populated before processing attached units
    if (allCallsProxy.length === 0) {
      console.warn("allCallsProxy is empty. Waiting for loadCalls to populate it.");
      return;
    }

    // Update the "All Calls" list with the latest attached units
    allCallsProxy = allCallsProxy.map(call => {
      const callAttachedUnits = attachedUnits.filter(unit => unit.callID === call.id);
      return { ...call, attachedUnits: callAttachedUnits.map(unit => unit.unitID) };
    });

    console.log("Updated allCallsProxy with attached units:", allCallsProxy);

    displayCalls(allCallsProxy); // Refresh the "All Calls" list

    // Reload the selected call's details and attached units if it is affected by the update
    if (selectedCallId) {
      const selectedCall = allCallsProxy.find(call => call.id === selectedCallId);
      if (selectedCall) {
        console.log(`Refreshing attached units and details for selected call: ${selectedCallId}`);
        await renderAttachedUnits(selectedCallId); // Ensure attached units are updated in real-time

        // Debugging: Log the DOM update
        console.log(`(DEBUG) UI updated for attached units of call ID: ${selectedCallId}`);
      } else {
        console.warn(`Selected call ID ${selectedCallId} not found in updated call list.`);
      }
    } else {
      console.warn("No call is currently selected.");
    }
  });
}

// Listen for changes to the selected call ID in Firestore
function listenForSelectedCallUpdates() {
  const selectedCallRef = doc(db, 'selectedCall', 'current');
  onSnapshot(selectedCallRef, async (docSnap) => {
    if (docSnap.exists()) {
      const { callId } = docSnap.data();
      console.log(`Selected call ID updated: ${callId}`);

      // Find the call in the allCallsProxy list
      const selectedCall = allCallsProxy.find(call => call.id === callId);
      if (selectedCall) {
        // Highlight the selected call in the UI
        document.querySelectorAll('.selected-call').forEach(card => card.classList.remove('selected-call'));
        const selectedCard = document.querySelector(`[data-call-id="${callId}"]`);
        if (selectedCard) {
          selectedCard.classList.add('selected-call');
        }

        // Render the attached units for the selected call
        console.log(`Rendering attached units for selected call: ${callId}`);
        await renderAttachedUnits(callId);
      } else {
        console.warn(`Call with ID ${callId} not found in allCallsProxy.`);
      }
    } else {
      console.warn('No selected call found in Firestore.');
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

// Initialize real-time listeners
function initializeRealTimeListeners() {
  initializeAllCallsListener(); // Initialize the allCalls listener
  loadCalls(); // Ensure calls are loaded initially
  listenForUnitUpdates(); // Ensure available units updates are handled
  listenForAttachedUnitUpdates(); // Ensure attached units updates are handled
  listenForSelectedCallUpdates(); // Ensure selected call updates are synchronized
  loadAvailableUnits();
}

// Initial load
initializeRealTimeListeners();
clearCallDetails(); // Ensure call details and attached units are cleared on page load