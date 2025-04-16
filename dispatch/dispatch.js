import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot, where, query, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getUnitTypeColor, getStatusColor } from './statusColor.js'; // Adjust the path if needed



// DOM element for the available units list
const availableUnitsList = document.getElementById('availableUnitsList');
let unsubscribeUnits = null;
let unsubscribeCalls = null;


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

function applyFilters() {
  const callsignFilter = document.getElementById('callsignFilter').value;
  const unitTypeFilter = document.getElementById('unitTypeFilter').value;
  const serviceFilter = document.getElementById('serviceFilter').value;

  const unitFilters = {
    callsign: callsignFilter,
    unitType: unitTypeFilter
  };

  const callFilters = {
    service: serviceFilter
  };

  if (unsubscribeUnits) {
    unsubscribeUnits();
  }
  if (unsubscribeCalls) {
    unsubscribeCalls();
  }

  unsubscribeUnits = listenForUnitsUpdates(unitFilters);
  unsubscribeCalls = listenForCallsUpdates(callFilters);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM elements
const callsList = document.getElementById('callsList');
const callerName = document.getElementById('callerName');
const callLocation = document.getElementById('callLocation');
const callService = document.getElementById('callService');
const callStatus = document.getElementById('callStatus');
const callTimestamp = document.getElementById('callTimestamp');
const attachedUnits = document.getElementById('attachedUnits');

// Load calls from Firestore
async function loadCalls() {
  const callsSnapshot = await getDocs(collection(db, "calls"));
  const calls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  displayCalls(calls);
}

function assignUnitToCall(callId, unitCalls) {
    const call = calls.find(c => c.id === callId);
    const unit = units.find(u => u.callsign === unitCalls);
    if (call && unit) {
      call.assignedUnit = unit;
      updateCallList();
    }
  }
  
// Real-time listener for calls collection
function listenForCallsUpdates(filters = {}) {
  const callsCollectionRef = collection(db, 'calls');
  let callsQuery = query(callsCollectionRef);

  if (filters.service) {
    callsQuery = query(callsQuery, where('service', '==', filters.service));
  }

  const unsubscribe = onSnapshot(callsQuery, (snapshot) => {
    const updatedCalls = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    updateCallsList(updatedCalls);
  });

  return unsubscribe;
}

function updateCallsList(calls) {
  const callsContainer = document.getElementById('callsList');
  callsContainer.innerHTML = ''; // Clear the existing list

  calls.forEach(call => {
    const callId = call.id;
    const callElement = document.createElement('div');
    const serviceColor = getUnitTypeColor(call.service);

    callElement.classList.add('call-card');
    callElement.setAttribute('data-call-id', callId); // Set the data-call-id attribute

    callElement.innerHTML = `
        <div class="call-info">
          <p class="call-service" style="background-color: ${serviceColor};"><strong>Service:</strong> ${call.service || 'Service not provided'}</p> 
          <p class="caller-name">${call.callerName || 'Unknown'}</p>
          <p class="call-location">${call.location || 'Location not provided'}</p>
          <p class="call-status">${call.status || 'Status not available'}</p>
          <div class="attached-units-container" id="attached-units-${callId}">
          <!-- Attached units will be dynamically inserted here -->
          </div>
        </div>
      `;

    callsContainer.appendChild(callElement);

    // Add event listener for double-click to select the call
    callElement.addEventListener('dblclick', () => {
      selectCall(call); // Assuming this function shows details in the details section
    });
      renderAttachedUnitsList(callId, call.attachedUnits);

  });
}

async function renderAttachedUnitsList(attachedUnitIds) {
  console.log(document.getElementById('attachedUnitsCallInfoSection')); // Debug log to check if the element exists
  const container = document.getElementById('attachedUnitsCallInfoSection'); // Ensure this targets the correct element
  container.innerHTML = ''; // Clear existing units

  for (const unitId of attachedUnitIds) {
    const unitRef = doc(db, 'units', unitId);
    const unitSnap = await getDoc(unitRef);

    if (unitSnap.exists()) {
      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('unit-card'); // Use the same style as units in .unit-browser
      unitDiv.dataset.unitId = unitId;

      // Add unit details
      unitDiv.innerHTML = `
        <div class="unit-status ${unitData.status.toLowerCase()}">
          ${unitData.status}
        </div>
        <div class="unit-details">
          <p><strong>Callsign:</strong> ${unitData.callsign || 'N/A'}</p>
          <p><strong>Unit Type:</strong> ${unitData.unitType || 'Unknown'}</p>
        </div>
      `;

      // Append the unit to the container
      container.appendChild(unitDiv);
    }
  }
}

  // Function to listen for updates in the units collection
  function listenForUnitsUpdates(filters = {}) {
    const unitsCollectionRef = collection(db, 'units');
    let unitsQuery = query(unitsCollectionRef);
  
    if (filters.callsign) {
      unitsQuery = query(unitsQuery, where('callsign', '>=', filters.callsign));
    }
    if (filters.unitType) {
      unitsQuery = query(unitsQuery, where('unitType', '==', filters.unitType));
    }
  
    const unsubscribe = onSnapshot(unitsQuery, (snapshot) => {
      const updatedUnits = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      updateUnitsList(updatedUnits);
    });
  
    return unsubscribe;
  }
  function updateUnitsList(units) {
    const unitsContainer = document.getElementById('availableUnitsList');
    unitsContainer.innerHTML = ''; // Clear the existing list
  
    units.forEach(unit => {
      const unitElement = document.createElement('div');
      unitElement.id = `unit-${unit.id}`;
      unitElement.classList.add('unit-card');
      unitElement.style.backgroundColor = 'white'; // Set the card background to white
  
      // Create a status container with the appropriate background color
      const statusContainer = document.createElement('div');
      statusContainer.classList.add('status-container');
      statusContainer.style.backgroundColor = getStatusColor(unit.status);
  
      statusContainer.innerHTML = `
        <h3>${unit.status}</h3>
      `;
  
      // Add the status container and other unit details to the unit card
      unitElement.appendChild(statusContainer);
      unitElement.innerHTML += `
        <p>Callsign: ${unit.callsign}</p>
        <p>Type: ${unit.unitType}</p>
      `;
  
      unitsContainer.appendChild(unitElement);
    });
  }
  
  

// Display calls in the list
function displayCalls(calls) {
  const callListContainer = document.getElementById('callsList'); // Ensure this element exists in the DOM
  callListContainer.innerHTML = ''; // Clear previous list

  calls.forEach(call => {
    console.log(`Rendering call card for ID: ${call.id}`); // Debug log

    const callCard = document.createElement('div');
    callCard.classList.add('call-card');
    callCard.dataset.callId = call.id; // Set the data-call-id attribute
    const callId = call.id;

    // Create the service color for the service box
    const serviceColor = getUnitTypeColor(call.service);

    // Build the call information for each card
    callCard.innerHTML = `
      <div class="call-info">
        <p class="call-service" style="background-color: ${serviceColor};"><strong>Service:</strong> ${call.service || 'Service not provided'}</p> 
        <p class="caller-name">${call.callerName || 'Unknown'}</p>
        <p class="call-location">${call.location || 'Location not provided'}</p>
        <p class="call-status">${call.status || 'Status not available'}</p>
        <div class="attached-units-container" id="attached-units-${callId}">
          <!-- Attached units will be dynamically inserted here -->
        </div>
      </div>
    `;

    // Append the call card to the container
    callListContainer.appendChild(callCard);
    // Add event listener for double-click to select the call
    callCard.addEventListener('dblclick', () => {
      selectCall(call);
      
    });
  });
}
  

// Format the timestamp to a more readable format
function formatTimestamp(timestamp) {
  const date = new Date(timestamp.seconds * 1000);
  return date.toLocaleString();
}

// Display the selected call's details in the Call Details section
async function selectCall(call) {
  console.log(`Querying for call card with ID: ${call.id}`);

  // Wait for the DOM to update
  await new Promise(resolve => setTimeout(resolve, 50)); // Add a short delay

  // Find the call card in the DOM
  const selectedCard = document.querySelector(`[data-call-id="${call.id}"]`);
  console.log('Selected card:', selectedCard); // Log the result of the query

  if (selectedCard) {
    // Clear the previous selection
    const previousSelectedCard = document.querySelector('.selected-call');
    if (previousSelectedCard) {
      previousSelectedCard.classList.remove('selected-call');
    }

    // Highlight the selected call
    selectedCard.classList.add('selected-call');

    // Display the call details in the Call Details section
    callerName.textContent = call.callerName || 'Unknown';
    callLocation.textContent = call.location || 'Location not provided';
    callService.textContent = call.service || 'Service not provided';
    callStatus.textContent = call.status || 'Status not available';
    callTimestamp.textContent = call.timestamp ? formatTimestamp(call.timestamp) : 'Timestamp not available';

    // Render attached units for the selected call
      renderAttachedUnits(call.id, call.attachedUnits);
  }
}

async function renderAttachedUnits(callId, attachedUnitIds) {
  const container = document.getElementById(`attached-units-${callId}`);
  container.innerHTML = ''; // Clear existing units

  for (const unitId of attachedUnitIds) {
    const unitRef = doc(db, 'units', unitId);
    const unitSnap = await getDoc(unitRef);

    if (unitSnap.exists()) {
      const unitData = unitSnap.data();
      const unitDiv = document.createElement('div');
      unitDiv.classList.add('attached-unit');

      // Normalize status for CSS class
      const statusClass = unitData.status.replace(/\s+/g, '-').toLowerCase();
      unitDiv.classList.add(statusClass);

      unitDiv.textContent = unitData.callsign;
      container.appendChild(unitDiv);
    }
  }
}

// Load all units from Firestore (regardless of their status)
async function loadUnits() {
    const unitsSnapshot = await getDocs(collection(db, "units"));
    const units = unitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    displayUnits(units);
  }
  
  // Display all units in the available units list
  // Display all units in the available units list
// Display all units in the available units list
function displayUnits(units) {
    availableUnitsList.innerHTML = ''; // Clear previous units
    
    units.forEach(unit => {
      const unitCard = document.createElement('div');
      unitCard.classList.add('unit-card');
      unitCard.dataset.unitId = unit.id;
  
      // Get the color for the unit's service type using getUnitTypeColor
      const unitColor = getUnitTypeColor(unit.unitType); // Use `unit.unitType` to get the color
  
      // Apply the background color to the card
      unitCard.style.backgroundColor = unitColor;
  
      unitCard.innerHTML = `
        <div class="unit-status ${unit.status.toLowerCase()}">
          ${unit.status}
        </div>
        <div class="unit-details">
          <p><strong>Callsign:</strong> ${unit.callsign || 'N/A'}</p>
          <p><strong>Unit Type:</strong> ${unit.unitType || 'Unknown'}</p> <!-- Display unit type -->
        </div>
      `;
  
      availableUnitsList.appendChild(unitCard);
    });
  }


// Initial load of calls
loadCalls();
// inital load units
loadUnits();
// inital checking for call listening sytarting
// Call the listener when the page is loaded
listenForCallsUpdates();
unsubscribeUnits = listenForUnitsUpdates();

document.getElementById('unitTypeFilter').addEventListener('change', applyFilters);
document.getElementById('serviceFilter').addEventListener('change', applyFilters);
document.getElementById('callsignFilter').addEventListener('input', applyFilters);