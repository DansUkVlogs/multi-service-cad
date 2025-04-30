import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc, onSnapshot, query, where, setDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStatusColor, getUnitTypeColor, getContrastingTextColor } from "./statusColor.js";

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

let selectedCallId = null; // Track the selected call ID

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

// Populate the callType dropdown based on the selected service
async function populateCallTypeDropdown(service) {
    const callTypeDropdown = document.getElementById("callType");
    callTypeDropdown.innerHTML = ""; // Clear existing options

    if (!service) {
        // Add a default "No service selected" option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select a service first";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        callTypeDropdown.appendChild(defaultOption);
        return;
    }

    try {
        const dropdownOptions = await fetchDropdownOptions();
        const options = dropdownOptions[service] || [];

        // Populate the dropdown with options for the selected service
        options.forEach(option => {
            const optionElement = document.createElement("option");
            optionElement.value = option.id;
            optionElement.textContent = option.type;
            callTypeDropdown.appendChild(optionElement);
        });
    } catch (error) {
        console.error("Error populating callType dropdown:", error);
    }
}

// Function to populate the callType dropdown in the call details section based on the selected service
async function populateCallDetailsDropdown(service) {
    const callTypeDropdown = document.getElementById("callTypeDropdown");
    callTypeDropdown.innerHTML = ""; // Clear existing options

    if (!service) {
        // Add a default "No service selected" option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select a service first";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        callTypeDropdown.appendChild(defaultOption);
        return;
    }

    try {
        const dropdownOptions = await fetchDropdownOptions();
        const options = dropdownOptions[service] || [];

        // Populate the dropdown with options for the selected service
        options.forEach(option => {
            const optionElement = document.createElement("option");
            optionElement.value = option.id;
            optionElement.textContent = option.type;
            callTypeDropdown.appendChild(optionElement);
        });
    } catch (error) {
        console.error("Error populating callType dropdown:", error);
    }
}

// Attach event listener to the service dropdown in the Add Call modal
document.addEventListener("DOMContentLoaded", () => {
    const serviceDropdown = document.getElementById("service");
    if (serviceDropdown) {
        serviceDropdown.addEventListener("change", (e) => {
            const selectedService = e.target.value;
            populateCallTypeDropdown(selectedService);
        });

        // Set the default state of the dropdowns
        serviceDropdown.value = ""; // No service selected by default
        populateCallTypeDropdown(""); // Clear the callType dropdown initially
    }
});

// Update the calls list based on the selected service filter
callServiceFilter.addEventListener('change', () => {
    const selectedService = callServiceFilter.value;

    // Filter calls based on the selected service
    const filteredCalls = selectedService === 'All'
        ? allCalls // Show all calls if "All" is selected
        : allCalls.filter(call => call.service === selectedService);

    displayCalls(filteredCalls); // Render the filtered calls
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

// Fix `loadCalls` to ensure calls are fetched and displayed correctly
async function loadCalls() {
    try {
        const snapshot = await getDocs(collection(db, 'calls'));
        const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (calls.length === 0) {
            callsList.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
            return;
        }

        allCalls = calls; // Store all calls globally
        displayCalls(allCalls); // Render the fetched calls
    } catch (error) {
        console.error('Error fetching calls collection:', error);
        callsList.innerHTML = '<p>Error loading calls. Please try again later.</p>';
    }
}

// Deduplicate calls by their ID
function deduplicateCalls(calls) {
    const uniqueCalls = new Map();
    calls.forEach(call => {
        uniqueCalls.set(call.id, call); // Use the call ID as the key to ensure uniqueness
    });
    return Array.from(uniqueCalls.values());
}

// Render attached units under each call in the "All Calls" list
async function renderAttachedUnitsForCall(callId) {
    const attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
    if (!attachedUnitsContainer) return;

    // Fetch attached units for the given call ID from the attachedUnits collection
    const attachedUnitQuery = query(attachedUnitsRef, where("callID", "==", callId));
    const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

    // If no attached units exist, update the container with a placeholder message
    if (attachedUnitSnapshot.empty) {
        attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
        return;
    }

    // Clear the container before rendering attached units
    attachedUnitsContainer.innerHTML = '';

    const renderedUnitIds = new Set(); // Track rendered unit IDs to prevent duplicates

    for (const docSnap of attachedUnitSnapshot.docs) {
        try {
            const { unitID } = docSnap.data(); // Use `unitID` for attachedUnits
            if (renderedUnitIds.has(unitID)) continue; // Skip duplicates

            const unitRef = doc(db, 'units', unitID);
            const unitSnap = await getDoc(unitRef);

            if (!unitSnap.exists()) continue;

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

// Fix `displayCalls` to ensure calls are rendered correctly and sorted by date/time
async function displayCalls(calls) {
    callsList.innerHTML = ''; // Clear existing calls

    if (calls.length === 0) {
        callsList.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
        return;
    }

    // Sort calls by timestamp (newest first)
    calls.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return dateB - dateA; // Newest first
    });

    calls.forEach(async (call) => {
        const callCard = document.createElement('div');
        callCard.classList.add('call-card');
        callCard.dataset.callId = call.id;

        const serviceColor = getUnitTypeColor(call.service);

        // Format the timestamp
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
    });
}

// Fix `renderAttachedUnits` to correctly use `unitId` when fetching unit details
async function renderAttachedUnits(callId) {
    const attachedUnitsContainer = document.getElementById('attachedUnits');
    if (!attachedUnitsContainer) return;

    // Clear the container to prevent duplicate rendering
    attachedUnitsContainer.innerHTML = '';

    try {
        // Use `query` to filter the attachedUnits collection by callID
        const attachedUnitQuery = query(attachedUnitsRef, where("callID", "==", callId));
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

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
                const unitRef = doc(db, 'units', unitID); // Fetch unit details from the 'units' collection
                const unitSnap = await getDoc(unitRef);

                if (!unitSnap.exists()) {
                    console.warn(`Unit with ID ${unitID} not found in the 'units' collection.`);
                    continue; // Skip if the unit does not exist
                }

                const unitData = unitSnap.data();

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

// Fix `loadAvailableUnits` to ensure units are fetched and displayed correctly
async function loadAvailableUnits() {
    try {
        const snapshot = await getDocs(availableUnitsRef);
        const availableUnits = [];

        for (const docSnap of snapshot.docs) {
            const docData = docSnap.data();
            const unitId = docData.unitId; // Use `unitId` from the document data

            if (!unitId) {
                console.warn(`Skipping document with missing unitId:`, docData);
                continue; // Skip if `unitId` is missing
            }

            try {
                const unitRef = doc(db, 'units', unitId); // Fetch unit details using `unitId`
                const unitSnap = await getDoc(unitRef);

                if (!unitSnap.exists()) {
                    console.warn(`Unit with unitId ${unitId} not found in the 'units' collection.`);
                    continue; // Skip if the unit does not exist
                }

                const unitData = { id: unitId, ...unitSnap.data() };
                availableUnits.push(unitData);
            } catch (error) {
                console.error(`Error fetching unit details for unitId ${unitId}:`, error);
            }
        }

        allUnits = availableUnits; // Store all units for filtering
        renderUnitCards(allUnits); // Render the fetched unit details
    } catch (error) {
        console.error('Error fetching availableUnits collection:', error);
        availableUnitsList.innerHTML = '<p>Error loading units. Please try again later.</p>';
    }
}

// Add the renderUnitCards function
function renderUnitCards(units) {
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

// Add the selectCall function
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
            await populateCallDetailsDropdown(call.service || 'Police'); // Populate dropdown based on service
            callTypeDropdown.value = call.callType || ''; // Select the current call type
        }

        // Clear and render attached units for the selected call
        attachedUnits.innerHTML = ''; // Clear the container to avoid duplicates
        await renderAttachedUnits(call.id);
    }
}

// Add the selectUnit function
function selectUnit(unitElement, section) {
    if (selectedUnit) selectedUnit.classList.remove('selected-unit'); // Deselect the previously selected unit
    selectedUnit = unitElement; // Set the new selected unit
    selectedUnitSection = section; // Track the section (e.g., 'manage' or 'attached')
    selectedUnit.classList.add('selected-unit'); // Highlight the selected unit
}

// Attach a unit to a call
async function attachUnit(unitId, callId) {
    try {
        // Query the availableUnits collection for the unit
        const querySnapshot = await getDocs(query(availableUnitsRef, where("unitId", "==", unitId)));
        const unitDoc = querySnapshot.docs[0]; // Get the first matching document

        if (!unitDoc) {
            console.warn(`Unit with unitId ${unitId} not found in availableUnits.`);
            return;
        }

        // Add the unit to the attachedUnits collection
        await setDoc(doc(attachedUnitsRef, `${unitId}_${callId}`), { unitID: unitId, callID: callId });

        // Remove the unit from the availableUnits collection
        await deleteDoc(unitDoc.ref);

        // Refresh the UI
        await renderAttachedUnits(callId); // Update the "Attached Units" section
        await renderAttachedUnitsForCall(callId); // Update the "All Calls" list
        await loadAvailableUnits(); // Ensure the "Manage Units" section is updated

        console.log(`Unit ${unitId} attached to call ${callId}.`);
    } catch (error) {
        console.error('Error attaching unit:', error);
        throw error; // Re-throw the error to handle it in the calling function
    }
}

// Move a unit from attachedUnits to availableUnits
async function detachUnit(unitId, callId) {
    try {
        const unitDocRef = doc(attachedUnitsRef, `${unitId}_${callId}`); // Use `doc` to create a document reference
        const unitSnap = await getDoc(unitDocRef);

        if (!unitSnap.exists()) {
            console.warn(`Unit with ID ${unitId} not found in attachedUnits for call ${callId}.`);
            return;
        }

        // Add the unit back to the availableUnits collection
        await addDoc(availableUnitsRef, { unitId }); // Ensure `unitId` is used here

        // Remove the unit from the attachedUnits collection
        await deleteDoc(unitDocRef);

        // Refresh the UI
        await renderAttachedUnits(callId); // Update the "Attached Units" section
        await renderAttachedUnitsForCall(callId); // Update the "All Calls" list
        await loadAvailableUnits(); // Ensure the "Manage Units" section is updated

        console.log(`Unit ${unitId} detached from call ${callId}.`);
    } catch (error) {
        console.error('Error detaching unit:', error);
    }
}

// Save changes to the selected call
async function saveCallChanges() {
    const callId = selectedCallId; // Use the globally tracked selected call ID
    const description = document.getElementById("callDescription").value.trim();
    const callTypeDropdown = document.getElementById("callTypeDropdown");
    const callType = callTypeDropdown.value;

    if (!callId) {
        alert("No call selected to save changes.");
        return;
    }

    // Get the selected call type's text (e.g., "Police Pursuit") for the status
    const callTypeText = callTypeDropdown.options[callTypeDropdown.selectedIndex].text;
    const status = `${callType}-${callTypeText}`; // Combine the code and message for the status

    try {
        const callDocRef = doc(db, "calls", callId);
        await setDoc(callDocRef, { description, callType, status }, { merge: true }); // Update description, callType, and status
        alert("Call details updated successfully.");

        // Refresh the selected call details
        await refreshCallsList(); // Ensure the "All Calls" list is updated
        refreshSelectedCallDetails(); // Ensure the selected call remains updated
    } catch (error) {
        console.error("Error updating call:", error);
        alert("Failed to update call details. Please try again.");
    }
}

// Function to refresh the calls list
async function refreshCallsList() {
    try {
        const snapshot = await getDocs(collection(db, "calls"));
        const updatedCalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allCalls = updatedCalls; // Update the global calls array
        displayCalls(allCalls); // Re-render the calls list
    } catch (error) {
        console.error("Error refreshing calls list:", error);
    }
}

// Function to refresh the "Manage Units" section
async function refreshAvailableUnits() {
    await loadAvailableUnits(); // Reload available units
}

// Function to remove duplicate attached units
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

// Function to refresh the selected call details
function refreshSelectedCallDetails() {
    const selectedCall = allCalls.find(call => call.id === selectedCallId);
    if (selectedCall) {
        // Update the call details section
        callerName.textContent = selectedCall.callerName || 'Unknown';
        callLocation.textContent = selectedCall.location || 'Location not provided';
        callStatus.textContent = selectedCall.status || 'Awaiting Dispatch';

        // Format the timestamp
        let formattedTimestamp = 'Timestamp not available';
        if (selectedCall.timestamp) {
            const timestamp = selectedCall.timestamp.toDate ? selectedCall.timestamp.toDate() : new Date(selectedCall.timestamp);
            formattedTimestamp = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
        }
        callTimestamp.textContent = formattedTimestamp;

        // Populate the description field
        const callDescription = document.getElementById('callDescription');
        if (callDescription) {
            callDescription.value = selectedCall.description || ''; // Set the description or leave it blank
        }

        // Populate the call type dropdown
        const callTypeDropdown = document.getElementById('callTypeDropdown');
        if (callTypeDropdown) {
            callTypeDropdown.value = selectedCall.callType || ''; // Select the current call type
        }

        // Re-render attached units
        renderAttachedUnits(selectedCallId);
    }
}

// Function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`; // Add a class based on the type (e.g., 'success', 'error')
    notification.textContent = message;

    // Style the notification to match the appearance in civilian.html
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
    notification.style.color = '#fff';
    notification.style.padding = '15px';
    notification.style.borderRadius = '5px';
    notification.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    notification.style.zIndex = '1000';
    notification.style.fontSize = '16px';

    // Add the notification to the body
    document.body.appendChild(notification);

    // Automatically remove the notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Ensure only one declaration of listenForCallUpdates exists
function listenForCallUpdates() {
    const callsRef = collection(db, "calls");
    const attachedUnitsRef = collection(db, "attachedUnits");
    const availableUnitsRef = collection(db, "availableUnits");

    // Listen for changes in the "calls" collection
    onSnapshot(callsRef, (snapshot) => {
        const updatedCalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allCalls = updatedCalls; // Update the global calls array
        displayCalls(allCalls); // Re-render the calls list

        // Update the selected call details if it is still selected
        if (selectedCallId) {
            refreshSelectedCallDetails();
        }
    }, (error) => {
        console.error("Error listening for call updates:", error);
    });

    // Listen for changes in the "attachedUnits" collectiononsole.error("Error refreshing calls list:", error);
    onSnapshot(attachedUnitsRef, () => {
        refreshCallsList(); // Refresh the calls list when attached units change
        refreshAvailableUnits(); // Refresh the "Manage Units" section
        if (selectedCallId) {// Function to refresh the "Manage Units" section
            refreshSelectedCallDetails(); // Refresh the selected call details
        }
    });

    // Correct the syntax for the "availableUnits" collection listener
    onSnapshot(availableUnitsRef, () => {
        refreshCallsList(); // Refresh the calls list when available units change
        refreshAvailableUnits(); // Refresh the "Manage Units" section
        if (selectedCallId) {
            refreshSelectedCallDetails(); // Refresh the selected call details
        }
    }, (error) => {
        console.error("Error listening for available units:", error);
    });
}

// Ensure the real-time listener is initialized on page load
document.addEventListener("DOMContentLoaded", async () => {
    listenForCallUpdates(); // Start listening for real-time updates
    await loadAvailableUnits(); // Load available units
});

// Attach event listeners for buttons
document.addEventListener("DOMContentLoaded", () => {
    // Attach button
    const attachBtn = document.getElementById("attachBtn");
    if (attachBtn) {
        attachBtn.addEventListener("click", async () => {
            if (selectedUnit && selectedUnitSection === "manage" && selectedCallId) {
                const unitId = selectedUnit.dataset.unitId;
                await attachUnit(unitId, selectedCallId);
                showNotification("Unit attached successfully.", "success");
            } else {
                showNotification("No unit selected or no call selected.", "error");
            }
        });
    }

    // Detach button
    const detachBtn = document.getElementById("detachBtn");
    if (detachBtn) {
        detachBtn.addEventListener("click", async () => {
            if (selectedUnit && selectedUnitSection === "attached" && selectedCallId) {
                const unitId = selectedUnit.dataset.unitId;
                await detachUnit(unitId, selectedCallId);
                showNotification("Unit detached successfully.", "success");
            } else {
                showNotification("No unit selected or no call selected.", "error");
            }
        });
    }

    // Add Call button
    const addCallBtn = document.getElementById("addCallBtn");
    if (addCallBtn) {
        addCallBtn.addEventListener("click", () => {
            const addCallModal = document.getElementById("addCallModal");
            if (addCallModal) {
                addCallModal.style.display = "block"; // Show the modal
            }
        });

        // Close the Add Call modal when clicking the close button
        const closeModalButton = document.querySelector("#addCallModal .close");
        if (closeModalButton) {
            closeModalButton.addEventListener("click", () => {
                const addCallModal = document.getElementById("addCallModal");
                if (addCallModal) {
                    addCallModal.style.display = "none"; // Hide the modal
                }
            });
        }

        // Handle form submission for adding a new call
        const addCallForm = document.getElementById("addCallForm");
        if (addCallForm) {
            addCallForm.addEventListener("submit", async (e) => {
                e.preventDefault();

                const callerName = "DISPATCH GENERATED"; // Default caller name
                const description = document.getElementById("description").value.trim();
                const location = document.getElementById("location").value.trim();
                const service = document.getElementById("service").value;
                const callType = document.getElementById("callType").value;

                if (!description || !location || !service || !callType) {
                    showNotification("Please fill out all required fields.", "error");
                    return;
                }

                try {
                    await addDoc(collection(db, "calls"), {
                        callerName,
                        description,
                        location,
                        service,
                        callType,
                        status: `${callType}-${document.getElementById("callType").options[document.getElementById("callType").selectedIndex].text}`,
                        timestamp: new Date(),
                    });
                    showNotification("New call added successfully.", "success");

                    const addCallModal = document.getElementById("addCallModal");
                    if (addCallModal) {
                        addCallModal.style.display = "none"; // Close the modal
                    }
                    addCallForm.reset(); // Reset the form
                    await loadCalls(); // Reload the calls list
                } catch (error) {
                    console.error("Error adding new call:", error);
                    showNotification("Failed to add new call. Please try again.", "error");
                }
            });
        }
    }

    // Close Call button
    if (closeCallBtn) {
        closeCallBtn.addEventListener("click", async () => {
            if (!selectedCallId) {
                showNotification("No call is selected.", "error");
                return;
            }

            try {
                const callDocRef = doc(db, "calls", selectedCallId);
                await deleteDoc(callDocRef); // Remove the call from Firestore
                showNotification("Call closed successfully.", "success");

                selectedCallId = null; // Reset the selected call ID
                callerName.textContent = "";
                callLocation.textContent = "";
                callStatus.textContent = "";
                callTimestamp.textContent = "";
                attachedUnits.innerHTML = "<p>No Attached Units</p>"; // Clear attached units
                await loadCalls(); // Reload the calls list to reflect the deletion
            } catch (error) {
                console.error("Error closing call:", error);
                showNotification("Failed to close the call. Please try again.", "error");
            }
        });
    }

    // Save Changes button
    const saveCallDetailsButton = document.getElementById("saveCallDetails");
    if (saveCallDetailsButton) {
        saveCallDetailsButton.addEventListener("click", async () => {
            await saveCallChanges();
        });
    }
});
