import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, setDoc, addDoc, getDoc, getDocs, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
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

// Firestore collections
const availableUnitsRef = collection(db, 'availableUnits');
const attachedUnitsRef = collection(db, 'attachedUnit');

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

// Fix `loadCalls` to render attached units for each call
async function loadCalls() {
    try {
        const snapshot = await getDocs(collection(db, "calls")); // Fetch all documents
        const calls = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(call => !call.placeholder); // Exclude placeholder calls

        if (calls.length === 0) {
            callsList.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
            return;
        }

        allCalls = calls; // Store all calls globally
        displayCalls(allCalls); // Render the fetched calls

        // Render attached units for each call in the "All Calls" list
        for (const call of allCalls) {
            await renderAttachedUnitsForCall(call.id);
        }
    } catch (error) {
        console.error("Error fetching calls collection:", error);
        callsList.innerHTML = '<p>Error loading calls. Please try again later.</p>';
    }
}

// Fix `renderAttachedUnitsForCall` to ensure attached units are displayed correctly
async function renderAttachedUnitsForCall(callId) {
    const attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
    if (!attachedUnitsContainer) return;

    attachedUnitsContainer.innerHTML = ''; // Clear existing content

    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("callID", "==", callId) // Fetch units attached to the specific call
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        if (attachedUnitSnapshot.empty) {
            attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
            return;
        }

        const renderedUnitIds = new Set(); // Track rendered unit IDs to prevent duplicates

        for (const docSnap of attachedUnitSnapshot.docs) {
            const { unitID } = docSnap.data();

            if (!unitID || renderedUnitIds.has(unitID)) {
                continue; // Skip missing unit IDs or duplicates
            }

            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);

            if (!unitSnap.exists()) {
                console.warn(`Unit with ID ${unitID} not found.`);
                continue;
            }

            const unitData = unitSnap.data();
            const unitDiv = document.createElement('div');
            unitDiv.classList.add('attached-unit');
            unitDiv.style.backgroundColor = getStatusColor(unitData.status);
            unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status));
            unitDiv.innerHTML = `<strong>${unitData.callsign || 'N/A'}</strong> (${unitData.unitType || 'Unknown'})`;
            attachedUnitsContainer.appendChild(unitDiv);
            renderedUnitIds.add(unitID); // Mark this unit as rendered
        }

        if (renderedUnitIds.size === 0) {
            attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
        }
    } catch (error) {
        console.error(`Error fetching attached units for call ID ${callId}:`, error);
        attachedUnitsContainer.innerHTML = '<p>Error loading attached units.</p>';
    }
}

// Fix `displayCalls` to ensure the `selectCall` function is properly invoked
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

    calls.forEach((call) => {
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

        // Attach click event listener to select the call
        callCard.addEventListener('click', () => selectCall(call));

        callsList.appendChild(callCard);
    });
}

// Add a real-time listener for the selected call's details
function listenForSelectedCallUpdates() {
    if (!selectedCallId) return;

    const callDocRef = doc(db, "calls", selectedCallId);

    // Listen for changes to the selected call document
    onSnapshot(callDocRef, async (docSnap) => {
        if (docSnap.exists()) {
            const callData = docSnap.data();

            // Update the "Call Details" section
            callerName.textContent = callData.callerName || "Unknown";
            callLocation.textContent = callData.location || "Location not provided";
            callStatus.textContent = callData.status || "Awaiting Dispatch";

            // Format and update the timestamp
            let formattedTimestamp = "Timestamp not available";
            if (callData.timestamp) {
                const timestamp = callData.timestamp.toDate ? callData.timestamp.toDate() : new Date(callData.timestamp);
                formattedTimestamp = `${timestamp.toLocaleTimeString("en-GB")} ${timestamp.toLocaleDateString("en-GB")}`;
            }
            callTimestamp.textContent = formattedTimestamp;

            // Update the service dropdown
            callServiceDropdown.value = callData.service || "Police";
            callServiceDropdown.style.backgroundColor = getUnitTypeColor(callData.service || "Police");
            callServiceDropdown.style.color = getContrastingTextColor(getUnitTypeColor(callData.service || "Police"));

            // Update the description field
            const callDescription = document.getElementById("callDescription");
            if (callDescription) {
                callDescription.value = callData.description || "";
            }

            // Update the call type dropdown
            const callTypeDropdown = document.getElementById("callTypeDropdown");
            if (callTypeDropdown) {
                await populateCallDetailsDropdown(callData.service || "Police"); // Repopulate dropdown options
                callTypeDropdown.value = callData.callType || ""; // Select the current call type
            }

            console.log("Call details and dropdown options updated in real-time.");
        } else {
            console.warn("Selected call document does not exist.");
        }
    }, (error) => {
        console.error("Error listening for selected call updates:", error);
    });
}

// Update `selectCall` to initialize the real-time listener for the selected call
function selectCall(call) {
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
        callServiceDropdown.style.backgroundColor = getUnitTypeColor(call.service || 'Police'); // Update dropdown color
        callServiceDropdown.style.color = getContrastingTextColor(getUnitTypeColor(call.service || 'Police'));

        // Populate the description field
        const callDescription = document.getElementById('callDescription');
        if (callDescription) {
            callDescription.value = call.description || ''; // Set the description or leave it blank
        }

        // Populate the call type dropdown based on the selected service
        const callTypeDropdown = document.getElementById('callTypeDropdown');
        if (callTypeDropdown) {
            populateCallDetailsDropdown(call.service || 'Police'); // Populate dropdown based on service
            callTypeDropdown.value = call.callType || ''; // Select the current call type
        }

        // Clear and render attached units for the selected call
        attachedUnits.innerHTML = ''; // Clear the container to avoid duplicates
        renderAttachedUnits(call.id);

        // Attach event listener to update the Call Type dropdown and color when the service changes
        callServiceDropdown.addEventListener('change', async (e) => {
            const newService = e.target.value;
            await populateCallDetailsDropdown(newService); // Update the Call Type dropdown
            callTypeDropdown.value = ''; // Reset the Call Type selection
            callServiceDropdown.style.backgroundColor = getUnitTypeColor(newService); // Update dropdown color
            callServiceDropdown.style.color = getContrastingTextColor(getUnitTypeColor(newService));
        });

        // Initialize the real-time listener for the selected call
        listenForSelectedCallUpdates();
    }
}

// Helper function to check if a callsign is already displayed
function isCallsignDisplayed(callsign) {
    const attachedUnitsContainer = document.getElementById('attachedUnits');
    if (!attachedUnitsContainer) return false;

    const existingUnits = attachedUnitsContainer.querySelectorAll('.unit-card');
    for (const unit of existingUnits) {
        if (unit.textContent.includes(callsign)) {
            return true; // Callsign is already displayed
        }
    }
    return false;
}

// Fix `renderAttachedUnits` to skip rendering units with duplicate callsigns
async function renderAttachedUnits(callId) {
    const attachedUnitsContainer = document.getElementById('attachedUnits');
    if (!attachedUnitsContainer) return;

    attachedUnitsContainer.innerHTML = ''; // Clear existing content

    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("callID", "==", callId) // Fetch units attached to the specific call
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        if (attachedUnitSnapshot.empty) {
            attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
            return;
        }

        const renderedUnitIds = new Set(); // Track rendered unit IDs to prevent duplicates

        for (const docSnap of attachedUnitSnapshot.docs) {
            const { unitID } = docSnap.data();

            if (!unitID || renderedUnitIds.has(unitID)) {
                continue; // Skip missing unit IDs or duplicates
            }

            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);

            if (!unitSnap.exists()) {
                console.warn(`Unit with ID ${unitID} not found.`);
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
                    <p><strong>Specific Type:</strong> ${unitData.specificType || ''}</p>
                </div>
            `;

            attachedUnitsContainer.appendChild(unitDiv);
            renderedUnitIds.add(unitID); // Mark this unit as rendered
        }

        if (renderedUnitIds.size === 0) {
            attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
        }
    } catch (error) {
        console.error(`Error fetching attached units for call ID ${callId}:`, error);
        attachedUnitsContainer.innerHTML = '<p>Error loading attached units.</p>';
    }
}

// Fix `attachUnit` to prevent duplicate rendering in the `attachedUnits` section
async function attachUnit(unitId, callId) {
    try {
        const querySnapshot = await getDocs(query(availableUnitsRef, where("unitId", "==", unitId)));
        const unitDoc = querySnapshot.docs[0];

        if (!unitDoc) {
            console.warn(`Unit with unitId ${unitId} not found in availableUnits.`);
            return;
        }

        const existingAttachedUnit = await getDocs(query(attachedUnitsRef, where("unitID", "==", unitId), where("callID", "==", callId)));
        if (!existingAttachedUnit.empty) {
            console.warn(`Unit ${unitId} is already attached to call ${callId}.`);
            return;
        }

        await setDoc(doc(attachedUnitsRef, `${unitId}_${callId}`), { unitID: unitId, callID: callId });
        await deleteDoc(unitDoc.ref);

        // Clear and refresh the `attachedUnits` section
        const attachedUnitsContainer = document.getElementById('attachedUnits');
        if (attachedUnitsContainer) {
            attachedUnitsContainer.innerHTML = ''; // Clear the container
        }
        await renderAttachedUnits(callId); // Update `callDetails`

        playSound("callupdate"); // Play call update sound
        console.log(`Unit ${unitId} attached to call ${callId}.`);
    } catch (error) {
        console.error('Error attaching unit:', error);
    }
}

// Fix `detachUnit` to update the `callDetails` section without duplicates
async function detachUnit(unitId, callId) {
    try {
        const unitDocRef = doc(db, "attachedUnits", `${unitId}_${callId}`);
        const unitSnap = await getDoc(unitDocRef);

        if (!unitSnap.exists()) {
            console.warn(`Unit with ID ${unitId} not found in attachedUnits for call ${callId}.`);
            return;
        }

        const existingAvailableUnit = await getDocs(query(availableUnitsRef, where("unitId", "==", unitId)));
        if (!existingAvailableUnit.empty) {
            console.warn(`Unit ${unitId} is already in the availableUnits collection.`);
            return;
        }

        await addDoc(availableUnitsRef, { unitId });
        await deleteDoc(unitDocRef);

        // Update the `callDetails` section
        attachedUnits.innerHTML = ''; // Clear the container
        await renderAttachedUnits(callId); // Update `callDetails`

        playSound("callupdate"); // Play call update sound
        console.log(`Unit ${unitId} detached from call ${callId}.`);
    } catch (error) {
        console.error('Error detaching unit:', error);
    }
}

// Fix `loadAvailableUnits` to ensure units are fetched and displayed correctly
async function loadAvailableUnits() {
    try {
        const snapshot = await getDocs(collection(db, "availableUnits")); // Fetch all documents
        const availableUnits = [];

        for (const docSnap of snapshot.docs) {
            const docData = docSnap.data();
            const unitId = docData.unitId;

            if (!unitId) {
                console.warn(`Skipping document with missing unitId:`, docData);
                continue; // Skip if `unitId` is missing
            }

            try {
                const unitRef = doc(db, "units", unitId);
                const unitSnap = await getDoc(unitRef);

                if (!unitSnap.exists()) {
                    console.warn(`Unit with unitId ${unitId} not found.`);
                    continue; // Skip non-existent units
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
        console.error("Error fetching availableUnits collection:", error);
        availableUnitsList.innerHTML = "<p>Error loading units. Please try again later.</p>";
    }
}

// Function to ensure a collection always exists by adding a placeholder document
async function ensureCollectionExists(collectionName) {
    try {
        const collectionRef = collection(db, collectionName);
        const snapshot = await getDocs(collectionRef);

        if (snapshot.empty) {
            // Add a placeholder document to the collection
            await addDoc(collectionRef, { placeholder: true, createdAt: new Date() });
            console.log(`Placeholder document added to the '${collectionName}' collection.`);
        }
    } catch (error) {
        console.error(`Error ensuring collection '${collectionName}' exists:`, error);
    }
}

// Example usage: Ensure the "calls", "units", "attachedUnits", "availableUnits", and "civilians" collections always exist
document.addEventListener("DOMContentLoaded", async () => {
    await ensureCollectionExists("calls");
    await ensureCollectionExists("units");
    await ensureCollectionExists("attachedUnits");
    await ensureCollectionExists("availableUnits");
    await ensureCollectionExists("civilians");
});

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
                <p><strong>Specific Type:</strong> ${unit.specificType || ''}</p>
            </div>
        `;

        unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'manage'));
        availableUnitsList.appendChild(unitDiv);
    });
}

// Add the selectUnit function
function selectUnit(unitElement, section) {
    if (selectedUnit) selectedUnit.classList.remove('selected-unit'); // Deselect the previously selected unit
    selectedUnit = unitElement; // Set the new selected unit
    selectedUnitSection = section; // Track the section (e.g., 'manage' or 'attached')
    selectedUnit.classList.add('selected-unit'); // Highlight the selected unit
}

// Add a real-time listener for the `calls` collection to update saved details across tabs
function listenForCallUpdates() {
    const callsRef = collection(db, "calls");

    // Listen for changes in the "calls" collection
    onSnapshot(
        callsRef,
        async (snapshot) => {
            console.log("Snapshot received for calls collection.");
            const updatedCalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Identify truly new calls
            const newCallIds = updatedCalls
                .filter(call => !allCalls.some(existingCall => existingCall.id === call.id))
                .map(call => call.id);

            // Update the global calls array
            allCalls = updatedCalls;
            console.log("Global allCalls length after update:", allCalls.length);

            displayCalls(allCalls); // Re-render the calls list

            // Play sound only for truly new calls
            if (newCallIds.length > 0) {
                playSound("newcall");
                console.log(`New calls detected: ${newCallIds.join(", ")}`);
            }

            // Re-render attached units for all calls in the "All Calls" list
            for (const call of allCalls) {
                await renderAttachedUnitsForCall(call.id);
            }

            // Ensure the selected call details are updated if it is still selected
            if (selectedCallId) {
                const selectedCall = allCalls.find(call => call.id === selectedCallId);
                if (selectedCall) {
                    refreshSelectedCallDetails(); // Update the selected call details
                } else {
                    // If the selected call was deleted, clear the details
                    selectedCallId = null;
                    callerName.textContent = "";
                    callLocation.textContent = "";
                    callStatus.textContent = "";
                    callTimestamp.textContent = "";
                    attachedUnits.innerHTML = "<p>No Attached Units</p>";
                }
            }

            console.log("Calls list and attached units updated in real-time across all tabs.");
        },
        (error) => {
            console.error("Error listening for call updates:", error);
        }
    );
}

// Add a real-time listener for the `units` collection to update the Manage Units section
function listenForUnitStatusUpdates() {
    const unitsRef = collection(db, "units");
    onSnapshot(unitsRef, async (snapshot) => {
        try {
            // Only update units that are currently in availableUnits
            const availableUnitIds = new Set(allUnits.map(unit => unit.id));
            let updated = false;
            for (const docSnap of snapshot.docs) {
                const unitData = docSnap.data();
                const unitId = docSnap.id;
                if (availableUnitIds.has(unitId)) {
                    // Update the unit in allUnits
                    const idx = allUnits.findIndex(u => u.id === unitId);
                    if (idx !== -1) {
                        allUnits[idx] = { id: unitId, ...unitData };
                        updated = true;
                    }
                }
            }
            if (updated) {
                renderUnitCards(allUnits);
            }
        } catch (error) {
            console.error("Error processing units snapshot:", error);
        }
    }, (error) => {
        console.error("Error listening for units updates:", error);
    });
}

// Ensure all real-time listeners are initialized on page load
document.addEventListener("DOMContentLoaded", async () => {
    listenForCallUpdates(); // Start listening for real-time updates to calls
    listenForAvailableUnitsUpdates(); // Start listening for real-time updates to available units
    listenForAttachedUnitsUpdates(); // Start listening for real-time updates to attached units
    listenForUnitStatusUpdates(); // Start listening for real-time updates to unit status
    await loadAvailableUnits(); // Load available units initially
    await loadCalls(); // Load calls
});

function listenForAvailableUnitsUpdates() {
    const availableUnitsRef = collection(db, "availableUnits");

    // Listen for changes in the "availableUnits" collection
    onSnapshot(availableUnitsRef, async (snapshot) => {
        try {
            const availableUnits = [];

            for (const docSnap of snapshot.docs) {
                const docData = docSnap.data();
                const unitId = docData.unitId;

                if (!unitId) {
                    console.warn(`Skipping document with missing unitId:`, docData);
                    continue; // Skip if `unitId` is missing
                }

                try {
                    const unitRef = doc(db, "units", unitId);
                    const unitSnap = await getDoc(unitRef);

                    if (!unitSnap.exists()) {
                        console.warn(`Unit with unitId ${unitId} not found.`);
                        continue; // Skip non-existent units
                    }

                    const unitData = { id: unitId, ...unitSnap.data() };
                    availableUnits.push(unitData);
                } catch (error) {
                    console.error(`Error fetching unit details for unitId ${unitId}:`, error);
                }
            }

            allUnits = availableUnits; // Update the global units array
            renderUnitCards(allUnits); // Re-render the "Manage Units" section
        } catch (error) {
            console.error("Error processing availableUnits snapshot:", error);
        }
    }, (error) => {
        console.error("Error listening for availableUnits updates:", error);
    });
}

function listenForAttachedUnitsUpdates() {
    const attachedUnitsRef = collection(db, "attachedUnit");

    // Listen for changes in the "attachedUnit" collection
    onSnapshot(attachedUnitsRef, async () => {
        try {
            // Refresh attached units for all calls in the "All Calls" section
            for (const call of allCalls) {
                await renderAttachedUnitsForCall(call.id);
            }

            // Refresh the attached units section in call details if a call is selected
            if (selectedCallId) {
                await renderAttachedUnits(selectedCallId);
            }
        } catch (error) {
            console.error("Error handling attachedUnits updates:", error);
        }
    });

    // Listen for changes in the "units" collection to update attached units in real-time
    const unitsRef = collection(db, "units");
    onSnapshot(unitsRef, async () => {
        try {
            // Re-render attached units for all calls in the "All Calls" section
            for (const call of allCalls) {
                await renderAttachedUnitsForCall(call.id);
            }
            // Re-render attached units for the selected call
            if (selectedCallId) {
                await renderAttachedUnits(selectedCallId);
            }
        } catch (error) {
            console.error("Error updating attached units on unit status change:", error);
        }
    });
}

// --- Dispatcher Duty Modal Logic ---
function getSessionId() {
    // Use sessionStorage to persist a unique session ID for this tab
    let sessionId = sessionStorage.getItem('dispatcherSessionId');
    if (!sessionId) {
        sessionId = 'dispatcher-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
        sessionStorage.setItem('dispatcherSessionId', sessionId);
    }
    return sessionId;
}

function showDispatcherDutyModal() {
    // Create modal HTML
    const modal = document.createElement('div');
    modal.id = 'dispatcher-duty-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div style="background: #fff; padding: 40px 32px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.18); text-align: center; min-width: 320px;">
            <h2 style="margin-bottom: 18px;">Start Dispatcher Duty</h2>
            <p style="margin-bottom: 24px;">You must start duty to access the dispatch panel.</p>
            <button id="start-dispatch-duty-btn" style="padding: 12px 32px; font-size: 1.2em; background: #0288D1; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Start Duty</button>
            <br><br>
            <button id="dispatcher-modal-back-home" style="padding: 10px 24px; font-size: 1em; background: #b71c1c; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Back to Home</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    document.getElementById('start-dispatch-duty-btn').onclick = async function() {
        await addDispatcherSession();
        modal.remove();
        document.body.classList.remove('modal-open');
    };
}

// Function to remove dispatcher session from database and return a message
async function removeDispatcherSessionFromDB() {
    const dispatcherId = sessionStorage.getItem('dispatcherSessionId');
    if (!dispatcherId || dispatcherId === 'None') {
        return 'No valid DispatcherID to delete.';
    }
    let alertMessage = '';
    try {
        // Try to delete the dispatcher document from Firestore
        await deleteDoc(doc(db, 'dispatchers', dispatcherId));
        alertMessage = `Dispatcher session ${dispatcherId} removed.`;
    } catch (error) {
        alertMessage = `Error removing dispatcher session: ${error.message}`;
    }
    sessionStorage.removeItem('dispatcherSessionId');
    return alertMessage;
}

// Function to handle Back to Home button click (for dispatcher)
async function handleBackToHomeDispatcher() {
    const alertMessage = await removeDispatcherSessionFromDB();
    // Optionally show a notification here if you want
    window.location.href = '../index.html';
}

// Attach event listener to the header Back to Home button
window.addEventListener('DOMContentLoaded', () => {
    const backHomeBtn = document.querySelector('.back-to-home');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleBackToHomeDispatcher();
        });
    }
});

// Use event delegation for modal Back to Home button
window.addEventListener('click', function(e) {
    const btn = e.target;
    if (btn && btn.id === 'dispatcher-modal-back-home') {
        handleBackToHomeDispatcher();
    }
});

// Display and update the number of active dispatchers
function setupDispatcherCountDisplay() {
    let countDisplay = document.getElementById('dispatcher-count-display');
    if (!countDisplay) {
        countDisplay = document.createElement('div');
        countDisplay.id = 'dispatcher-count-display';
        countDisplay.style.position = 'fixed';
        countDisplay.style.bottom = '18px';
        countDisplay.style.right = '24px';
        countDisplay.style.background = '#0288D1';
        countDisplay.style.color = '#fff';
        countDisplay.style.padding = '10px 22px';
        countDisplay.style.borderRadius = '16px';
        countDisplay.style.fontWeight = 'bold';
        countDisplay.style.fontSize = '1.1em';
        countDisplay.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        countDisplay.style.zIndex = '9998';
        document.body.appendChild(countDisplay);
    }
    // Listen for changes in the dispatchers collection
    const dispatchersRef = collection(db, 'dispatchers');
    onSnapshot(dispatchersRef, (snapshot) => {
        const count = snapshot.size;
        // Subtract 1 to exclude the current user
        let displayCount = Math.max(0, count - 1);
        countDisplay.textContent = `Active Dispatchers: ${displayCount}`;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    showDispatcherDutyModal();
    setupDispatcherCountDisplay();
});

// Add a dispatcher session to Firestore for this tab/session
async function addDispatcherSession() {
    const sessionId = getSessionId();
    try {
        await setDoc(doc(db, 'dispatchers', sessionId), {
            startedAt: new Date(),
            // Optionally, add more info (e.g., user info) here
        });
        updateDispatcherSessionIdDisplay(); // <-- Update the display after session is created
    } catch (error) {
        console.error('Error adding dispatcher session:', error);
    }
}

// Remove the dispatcher session from Firestore for this tab/session
async function removeDispatcherSession() {
    const sessionId = getSessionId();
    try {
        await deleteDoc(doc(db, 'dispatchers', sessionId));
        updateDispatcherSessionIdDisplay(); // <-- Update the display after session is removed
    } catch (error) {
        console.error('Error removing dispatcher session:', error);
    }
}

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
                    playSound("newcall"); // Play new call sound
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
                playSound("callclosed"); // Play call closed sound
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

// Add event listener for selecting attached units
function enableAttachedUnitSelection() {
    const attachedUnitsContainer = document.getElementById('attachedUnits');
    if (!attachedUnitsContainer) return;

    attachedUnitsContainer.addEventListener('click', (event) => {
        const unitElement = event.target.closest('.unit-card');
        if (!unitElement) return;

        // Deselect previously selected unit
        if (selectedUnit) selectedUnit.classList.remove('selected-unit');

        // Select the clicked unit
        selectedUnit = unitElement;
        selectedUnitSection = 'attached'; // Mark the section as 'attached'
        selectedUnit.classList.add('selected-unit'); // Highlight the selected unit
    });
}

// Ensure the event listener is initialized on page load
document.addEventListener("DOMContentLoaded", () => {
    enableAttachedUnitSelection(); // Enable selection of attached units
});

// Update `saveCallChanges` to refresh attached units under "All Calls" after saving changes
async function saveCallChanges() {
    const callId = selectedCallId; // Use the globally tracked selected call ID
    const description = document.getElementById("callDescription").value.trim();
    const callTypeDropdown = document.getElementById("callTypeDropdown");
    const callType = callTypeDropdown.value;
    const service = callServiceDropdown.value; // Get the updated service

    if (!callId) {
        alert("No call selected to save changes.");
        return;
    }

    // Get the selected call type's text (e.g., "Police Pursuit") for the status
    const callTypeText = callTypeDropdown.options[callTypeDropdown.selectedIndex]?.text || '';
    const status = `${callType}-${callTypeText}`; // Combine the code and message for the status

    try {
        const callDocRef = doc(db, "calls", callId);
        await setDoc(callDocRef, { description, callType, service, status }, { merge: true }); // Update description, callType, service, and status
        playSound("newnote"); // Play save changes sound
        alert("Call details updated successfully.");

        // Update the dropdown color to reflect the saved service
        callServiceDropdown.style.backgroundColor = getUnitTypeColor(service);
        callServiceDropdown.style.color = getContrastingTextColor(getUnitTypeColor(service));

        // Refresh the calls list and selected call details
        await refreshCallsList(); // Ensure the "All Calls" list is updated
        refreshSelectedCallDetails(); // Ensure the selected call remains updated

        // Refresh attached units for the updated call in the "All Calls" list
        await renderAttachedUnitsForCall(callId);
    } catch (error) {
        console.error("Error updating call:", error);
        alert("Failed to update call details. Please try again.");
    }
}

// Add the missing `refreshCallsList` function
async function refreshCallsList() {
    try {
        const snapshot = await getDocs(collection(db, "calls")); // Fetch all documents
        const calls = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(call => !call.placeholder); // Exclude placeholder calls

        allCalls = calls; // Update the global calls array
        displayCalls(allCalls); // Re-render the calls list
    } catch (error) {
        console.error("Error refreshing calls list:", error);
    }
}

// Add the missing `refreshSelectedCallDetails` function
async function refreshSelectedCallDetails() {
    if (!selectedCallId) {
        console.warn("No call is currently selected.");
        return;
    }

    try {
        const callDocRef = doc(db, "calls", selectedCallId);
        const callDoc = await getDoc(callDocRef);

        if (callDoc.exists()) {
            const callData = callDoc.data();

            // Update the call details section
            callerName.textContent = callData.callerName || "Unknown";
            callLocation.textContent = callData.location || "Location not provided";
            callStatus.textContent = callData.status || "Awaiting Dispatch";

            // Format and update the timestamp
            let formattedTimestamp = "Timestamp not available";
            if (callData.timestamp) {
                const timestamp = callData.timestamp.toDate ? callData.timestamp.toDate() : new Date(callData.timestamp);
                formattedTimestamp = `${timestamp.toLocaleTimeString("en-GB")} ${timestamp.toLocaleDateString("en-GB")}`;
            }
            callTimestamp.textContent = formattedTimestamp;

            // Update the service dropdown
            callServiceDropdown.value = callData.service || "Police";
            callServiceDropdown.style.backgroundColor = getUnitTypeColor(callData.service || "Police");
            callServiceDropdown.style.color = getContrastingTextColor(getUnitTypeColor(callData.service || "Police"));

            // Update the description and call type dropdown
            const callDescription = document.getElementById("callDescription");
            if (callDescription) {
                callDescription.value = callData.description || "";
            }

            const callTypeDropdown = document.getElementById("callTypeDropdown");
            if (callTypeDropdown) {
                await populateCallDetailsDropdown(callData.service || "Police");
                callTypeDropdown.value = callData.callType || "";
            }

            console.log("Selected call details refreshed successfully.");
        } else {
            console.warn("Selected call document does not exist.");
        }
    } catch (error) {
        console.error("Error refreshing selected call details:", error);
    }
}

// Add a helper function to display notifications
function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Style the notification
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.padding = "10px 15px";
    notification.style.borderRadius = "5px";
    notification.style.color = "#fff";
    notification.style.fontSize = "14px";
    notification.style.zIndex = "1000";

    // Set background color based on type
    switch (type) {
        case "success":
            notification.style.backgroundColor = "#4CAF50"; // Green
            break;
        case "error":
            notification.style.backgroundColor = "#F44336"; // Red
            break;
        case "warning":
            notification.style.backgroundColor = "#FFC107"; // Yellow
            break;
        default:
            notification.style.backgroundColor = "#2196F3"; // Blue
    }

    document.body.appendChild(notification);

    // Remove the notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Load audio paths
const audioPaths = {
    newcall: "https://s3.sonoransoftware.com/cad/default/call_open.mp3",
    callupdate: "https://s3.sonoransoftware.com/cad/default/call_edit.mp3",
    callclosed: "https://s3.sonoransoftware.com/cad/default/call_close.mp3",
    newnote: "https://s3.sonoransoftware.com/cad/default/notification1.mp3"
};

// Helper function to play a sound
function playSound(soundKey) {
    const audio = new Audio(audioPaths[soundKey]);
    audio.play().catch(error => console.error(`Error playing sound for ${soundKey}:`, error));
}

// Remove dispatcher session on page unload (for dispatch page)
window.addEventListener('beforeunload', () => {
    try {
        // Remove any existing dispatcher session, even if the page is reloaded
        const sessionId = sessionStorage.getItem('dispatcherSessionId');
        if (sessionId) {
            const projectId = "emergencycad-561d4";
            const apiKey = firebaseConfig.apiKey;
            const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/dispatchers/${sessionId}?key=${apiKey}`;
            let deleted = false;
            if (navigator.sendBeacon) {
                const blob = new Blob([], { type: 'application/json' });
                deleted = navigator.sendBeacon(url, blob);
            }
            if (!deleted) {
                fetch(url, {
                    method: 'DELETE',
                    keepalive: true
                });
            }
            sessionStorage.removeItem('dispatcherSessionId');
        }
    } catch (e) {
        // Ignore errors on unload
    }
});

// Ensure dispatcher session is removed on page unload/reload
window.addEventListener('beforeunload', function () {
    // Try to remove dispatcher session from Firestore and sessionStorage
    // Note: async functions can't be awaited here, but this will still trigger the cleanup in most cases
    removeDispatcherSessionFromDB();
    aleret("Session successfully ended. You can now close this tab.");
});

// Display current dispatcher session ID in the UI for debugging/cleanup
function displayDispatcherSessionId() {
    let sessionId = sessionStorage.getItem('dispatcherSessionId') || 'None';
    let el = document.getElementById('dispatcher-id-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'dispatcher-id-display';
        el.style = 'position:fixed;bottom:10px;left:10px;background:#222;color:#fff;padding:6px 12px;border-radius:6px;z-index:9999;font-size:14px;';
        document.body.appendChild(el);
    }
    el.textContent = `Dispatcher-ID: ${sessionId}`;
}

document.addEventListener('DOMContentLoaded', displayDispatcherSessionId);

// Update dispatcher session ID display on session change
function updateDispatcherSessionIdDisplay() {
    let el = document.getElementById('dispatcher-id-display');
    if (el) {
        let sessionId = sessionStorage.getItem('dispatcherSessionId') || 'None';
        el.textContent = `Dispatcher-ID: ${sessionId}`;
    }
}

// Call this after adding/removing session
// Example: after addDispatcherSession() or removeDispatcherSession()
// updateDispatcherSessionIdDisplay();
