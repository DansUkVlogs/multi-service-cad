import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, setDoc, addDoc, getDoc, getDocs, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStatusColor, getUnitTypeColor, getContrastingTextColor } from "./statusColor.js";

// --- Sound Mute Control for Startup Modal ---
let muteSounds = true; // Mute all sounds until modal is closed

// Only wrap playSound if it hasn't been wrapped yet
if (typeof window !== 'undefined' && typeof window.playSound === 'function' && !window._playSoundOriginal) {
    window._playSoundOriginal = window.playSound;
    window.playSound = function(soundName) {
        if (muteSounds) return;
        try {
            window._playSoundOriginal(soundName);
        } catch (e) {
            // Suppress all NotAllowedError and autoplay policy errors (all variations)
            const isNotAllowed = e && (e.name === 'NotAllowedError' || e.code === 20);
            const isAutoplayPolicy = e && typeof e.message === 'string' && (
                e.message.includes("play() failed because the user didn't interact") ||
                e.message.includes('play() failed') ||
                e.message.includes('autoplay policy') ||
                e.message.includes('The play() request was interrupted') ||
                e.message.includes('The play() request was prevented')
            );
            if (!isNotAllowed && !isAutoplayPolicy) {
                // Log all other errors
                console.error('Error playing sound for', soundName + ':', e);
            }
            // Otherwise, suppress error (do not log)
        }
    };
}
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

        // Do not render attached units here; handled by real-time listeners
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
            where("callID", "==", callId)
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        if (attachedUnitSnapshot.empty) {
            const unitDiv = document.createElement('div');
            unitDiv.innerHTML = `No Attached Units`;
            unitDiv.style.background = `rgba(190, 190, 190, 0.47)`;
            unitDiv.style.color = 'black';
            unitDiv.style.padding = '6px 14px';
            unitDiv.style.border = '1px solid black';
            unitDiv.style.borderRadius = '8px';
            unitDiv.style.fontWeight = 'bold';
            unitDiv.style.fontSize = '1em';
            unitDiv.style.whiteSpace = 'nowrap';
            attachedUnitsContainer.appendChild(unitDiv);
            return;
        }

        // Deduplicate by unitID: only one pill per unique unitID
        const seenUnitIDs = new Set();
        const pillsArr = [];
        for (const docSnap of attachedUnitSnapshot.docs) {
            const { unitID } = docSnap.data();
            if (!unitID || seenUnitIDs.has(unitID)) continue;
            seenUnitIDs.add(unitID);
            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);
            if (!unitSnap.exists()) {
                console.warn(`Unit with ID ${unitID} not found.`);
                continue;
            }
            const unitData = unitSnap.data();
            const callsign = (unitData.callsign || 'N/A').trim();
            pillsArr.push({ callsign, unitData });
        }

        if (pillsArr.length === 0) {
            attachedUnitsContainer.innerHTML = '<p>No Attached Units</p>';
            return;
        }

        // Sort by service, then callsign
        pillsArr.sort((a, b) => {
            const serviceA = (a.unitData.unitType || '').toLowerCase();
            const serviceB = (b.unitData.unitType || '').toLowerCase();
            if (serviceA < serviceB) return -1;
            if (serviceA > serviceB) return 1;
            return (a.callsign || '').localeCompare(b.callsign || '');
        });
        for (const { callsign, unitData } of pillsArr) {
            const service = unitData.unitType ? unitData.unitType : '';
            const pill = document.createElement('div');
            pill.className = 'all-calls-unit-pill';
            pill.textContent = service ? `${callsign} (${service})` : callsign;
            if (unitData.unitType) pill.setAttribute('data-service', unitData.unitType);
            if (unitData.status) {
                try {
                    const statusColor = getStatusColor(unitData.status);
                    const textColor = getContrastingTextColor(statusColor);
                    pill.style.backgroundColor = statusColor;
                    pill.style.color = textColor;
                    pill.style.padding = '8px 18px';
                    pill.style.borderRadius = '16px';
                    pill.style.whiteSpace = 'nowrap';
                    pill.style.overflow = 'visible';
                    pill.style.textOverflow = 'unset';
                    pill.style.minWidth = 'fit-content';
                    pill.style.width = 'fit-content';
                    pill.style.maxWidth = '100%';
                    pill.style.display = 'inline-block';
                    pill.style.textAlign = 'center';
                    pill.style.verticalAlign = 'middle';
                } catch (e) {
                    // fallback: do nothing
                }
            }
            attachedUnitsContainer.appendChild(pill);
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
        callsList.innerHTML = '<p>No calls available.</p>';
        return;
    }

    // Sort calls by timestamp (newest first)
    calls.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return dateB - dateA;
    });

    calls.forEach((call) => {
        const callCard = document.createElement('div');
        callCard.classList.add('call-card');
        callCard.dataset.callId = call.id;

        const serviceColor = getUnitTypeColor(call.service);
        const serviceTextColor = getContrastingTextColor(serviceColor);

        // Format the timestamp
        let formattedTimestamp = 'Timestamp not available';
        if (call.timestamp) {
            const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            formattedTimestamp = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
        }

        callCard.innerHTML = `
            <div class="call-info">
                <p class="call-service" style="background-color: ${serviceColor}; color: ${serviceTextColor};">${call.service || 'Service not provided'}</p>
                <p class="caller-name">Caller Name: ${call.callerName || 'Unknown'}</p>
                <p class="call-location"><strong>Location: ${call.location || 'Location not provided'}</strong></p>
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

        // Do NOT render attached units here; handled by real-time listener only
    });
}

// Helper to refresh all attached units for all calls (can be called after DOM is ready)
// Removed refreshAllAttachedUnits; all attached units are now handled by the real-time listener only.

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
                continue; // Skip missing unit IDs or duplicates by ID
            }
            renderedUnitIds.add(unitID);
            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);
            if (!unitSnap.exists()) {
                console.warn(`Unit with ID ${unitID} not found.`);
                continue;
            }
            const unitData = unitSnap.data();
            const callsign = (unitData.callsign || 'N/A').trim();
            const unitType = unitData.unitType || 'Unknown';
            const specificType = unitData.specificType || '';
            const status = unitData.status || 'Unknown';
            const statusColor = getStatusColor(status);
            const unitTypeColor = getUnitTypeColor(unitType);
            const textColor = getContrastingTextColor(statusColor);
            const serviceAbbr = (unitType.substring(0, 3) || 'UNK').toUpperCase();
            // Use the exact same card structure as renderUnitCards
            const unitDiv = document.createElement('div');
            unitDiv.classList.add('unit-card');
            unitDiv.dataset.unitId = unitID;
            unitDiv.style.backgroundColor = statusColor;
            unitDiv.style.color = textColor;
            unitDiv.style.setProperty('--unit-type-color', unitTypeColor);
            unitDiv.style.setProperty('--text-color', textColor);
            unitDiv.innerHTML = `
                <span class="unit-main">
                    <span class="unit-service-abbr" style="background:${unitTypeColor};color:${getContrastingTextColor(unitTypeColor)};">${serviceAbbr}</span>
                    <span class="unit-specific-type">${specificType}</span>
                </span>
                <span class="unit-callsign-box">${callsign}</span>
                <span class="unit-status-label ${status.toLowerCase().replace(/\s/g, '-')}" style="background:${statusColor};color:${getContrastingTextColor(statusColor)};">${status}</span>
            `;
            unitDiv.addEventListener('click', () => selectUnit(unitDiv, 'attached'));
            attachedUnitsContainer.appendChild(unitDiv);
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
        // The correct collection is 'attachedUnit', not 'attachedUnits'
        const unitDocRef = doc(db, "attachedUnit", `${unitId}_${callId}`);
        const unitSnap = await getDoc(unitDocRef);

        if (!unitSnap.exists()) {
            console.warn(`Unit with ID ${unitId} not found in attachedUnit for call ${callId}.`);
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
    availableUnitsList.innerHTML = '';
    if (units.length === 0) {
        availableUnitsList.innerHTML = '<p>No available units to display.</p>';
        return;
    }
    units.forEach(unit => {
        const callsign = unit.callsign || 'N/A';
        const unitType = unit.unitType || 'Unknown';
        const status = unit.status || 'Unknown';
        const specificType = unit.specificType || '';
        const statusColor = getStatusColor(status);
        const unitTypeColor = getUnitTypeColor(unitType);
        const textColor = getContrastingTextColor(statusColor);
        const serviceAbbr = (unitType.substring(0, 3) || 'UNK').toUpperCase();
        // Card
        const unitDiv = document.createElement('div');
        unitDiv.classList.add('unit-card');
        unitDiv.dataset.unitId = unit.id;
        unitDiv.style.backgroundColor = statusColor;
        unitDiv.style.color = textColor;
        unitDiv.style.setProperty('--unit-type-color', unitTypeColor);
        unitDiv.style.setProperty('--text-color', textColor);
        // Card content
        unitDiv.innerHTML = `
            <span class="unit-main">
                <span class="unit-service-abbr" style="background:${unitTypeColor};color:${getContrastingTextColor(unitTypeColor)};">${serviceAbbr}</span>
                <span class="unit-specific-type">${specificType}</span>
            </span>
            <span class="unit-callsign-box">${callsign}</span>
            <span class="unit-status-label ${status.toLowerCase().replace(/\s/g, '-')}" style="background:${statusColor};color:${getContrastingTextColor(statusColor)};">${status}</span>
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

            // Do not re-render attached units for all calls here; handled by listenForAttachedUnitsUpdates

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
            let changedUnitIds = new Set();
            for (const docSnap of snapshot.docs) {
                const unitData = docSnap.data();
                const unitId = docSnap.id;
                if (availableUnitIds.has(unitId)) {
                    // Update the unit in allUnits
                    const idx = allUnits.findIndex(u => u.id === unitId);
                    if (idx !== -1) {
                        allUnits[idx] = { id: unitId, ...unitData };
                        updated = true;
                        changedUnitIds.add(unitId);
                    }
                } else {
                    // Track all changed units for attached units update
                    changedUnitIds.add(unitId);
                }
            }
            if (updated) {
                renderUnitCards(allUnits);
            }

            // If a unit's status changed, and it is attached to the selected call, re-render attached units
            if (selectedCallId && changedUnitIds.size > 0) {
                // Query attachedUnit for this call
                const attachedUnitQuery = query(collection(db, "attachedUnit"), where("callID", "==", selectedCallId));
                const attachedUnitSnapshot = await getDocs(attachedUnitQuery);
                let shouldUpdate = false;
                for (const docSnap of attachedUnitSnapshot.docs) {
                    const { unitID } = docSnap.data();
                    if (changedUnitIds.has(unitID)) {
                        shouldUpdate = true;
                        break;
                    }
                }
                if (shouldUpdate) {
                    await renderAttachedUnits(selectedCallId);
                }
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
            // Remove all previous units from all calls before re-rendering
            for (const call of allCalls) {
                const container = document.getElementById(`attached-units-${call.id}`);
                if (container) container.innerHTML = '';
            }
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

    // The units listener is no longer responsible for updating attached units in the All Calls section.
    // Only the attachedUnit listener above will update attached units for all calls.
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
    muteSounds = true; // Ensure sounds are muted when modal is shown
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
    // Block all interaction with broadcast history and the 📢History button while modal is open
    // Place a blocker overlay above the history button and broadcast history
    let broadcastBlocker = document.getElementById('broadcast-blocker');
    if (!broadcastBlocker) {
        broadcastBlocker = document.createElement('div');
        broadcastBlocker.id = 'broadcast-blocker';
        broadcastBlocker.style.position = 'fixed';
        broadcastBlocker.style.top = '0';
        broadcastBlocker.style.left = '0';
        broadcastBlocker.style.width = '100vw';
        broadcastBlocker.style.height = '100vh';
        broadcastBlocker.style.background = 'transparent';
        broadcastBlocker.style.zIndex = '9998';
        broadcastBlocker.style.pointerEvents = 'auto';
        broadcastBlocker.tabIndex = -1;
        document.body.appendChild(broadcastBlocker);
    }
    // Blur and fade broadcast history visually
    const broadcastHistory = document.getElementById('broadcast-history');
    if (broadcastHistory) {
        broadcastHistory.style.filter = 'blur(2px)';
        broadcastHistory.style.opacity = '0.5';
    }
    // Also blur and fade the 📢History button if it exists
    const historyButton = document.querySelector('.history-button, #history-button, button[aria-label="History"], button[title*="History"]');
    if (historyButton) {
        historyButton.style.filter = 'blur(2px)';
        historyButton.style.opacity = '0.5';
        historyButton.style.pointerEvents = 'none';
        historyButton.style.zIndex = '9997'; // ensure it's below the blocker
    }
    // Ensure modal is appended last so it is on top
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    document.getElementById('start-dispatch-duty-btn').onclick = async function() {
        await addDispatcherSession();
        modal.remove();
        document.body.classList.remove('modal-open');
        muteSounds = false; // Unmute sounds after modal is closed
        // Restore broadcast history and history button interactivity
        const broadcastHistory = document.getElementById('broadcast-history');
        if (broadcastHistory) {
            broadcastHistory.style.filter = '';
            broadcastHistory.style.opacity = '';
        }
        const historyButton = document.querySelector('.history-button, #history-button, button[aria-label="History"], button[title*="History"]');
        if (historyButton) {
            historyButton.style.filter = '';
            historyButton.style.opacity = '';
            historyButton.style.pointerEvents = '';
            historyButton.style.zIndex = '';
        }
        const blocker = document.getElementById('broadcast-blocker');
        if (blocker && blocker.parentNode) {
            blocker.parentNode.removeChild(blocker);
        }
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

    // Close Call button with confirmation modal (copied from ambulance.js)
    if (closeCallBtn) {
        closeCallBtn.addEventListener("click", async () => {
            if (!selectedCallId) {
                showNotification("No call is selected.", "error");
                return;
            }
            showCloseCallConfirmationModal();
        });
    }

    // Show close call confirmation modal (copied and adapted from ambulance.js)
    function showCloseCallConfirmationModal() {
        // Remove any existing modal first
        const existingModal = document.getElementById('close-call-modal');
        if (existingModal) {
            existingModal.remove();
        }
        // Create background overlay
        const overlay = document.createElement('div');
        overlay.id = 'close-call-modal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.7);
            border: 3px solid #d32f2f;
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            box-sizing: border-box;
        `;
        // Create modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff;
            border: 3px solid #d32f2f;
            border-radius: 16px;
            padding: 32px 40px 24px 40px;
            min-width: 400px;
            max-width: 90vw;
            box-shadow: 0 8px 32px rgba(211, 47, 47, 0.3);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            font-family: inherit;
        `;
        // Create warning icon
        const warningIcon = document.createElement('div');
        warningIcon.innerHTML = '⚠️';
        warningIcon.style.cssText = `
            font-size: 3rem;
            margin-bottom: 10px;
        `;
        // Create title
        const title = document.createElement('div');
        title.textContent = 'CLOSE CALL - WARNING';
        title.style.cssText = `
            font-size: 1.8rem;
            color: #d32f2f;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
        `;
        // Create warning message
        const message = document.createElement('div');
        message.innerHTML = `
            <p style="color: #d32f2f; font-weight: bold; font-size: 1.1rem; text-align: center; margin: 0 0 15px 0;">
                Are you sure you wish to close this call?
            </p>
            <p style="color: #333; font-size: 1rem; text-align: center; margin: 0 0 10px 0;">
                <strong>This action will:</strong>
            </p>
            <ul style="color: #d32f2f; font-size: 1rem; text-align: left; margin: 0 0 15px 0; padding-left: 20px;">
                <li>Detach ALL units from this call</li>
                <li>Permanently delete the call</li>
                <li>Make the call inaccessible forever</li>
            </ul>
            <p style="color: #d32f2f; font-weight: bold; font-size: 1.1rem; text-align: center; margin: 0;">
                THIS CANNOT BE UNDONE!
            </p>
        `;
        // Create checkbox container
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 15px 0;
            padding: 12px;
            background: #ffebee;
            border: 2px solid #d32f2f;
            border-radius: 8px;
            width: 100%;
            box-sizing: border-box;
        `;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'close-call-confirm-checkbox';
        checkbox.style.cssText = `
            transform: scale(1.2);
            margin-right: 5px;
        `;
        const checkboxLabel = document.createElement('label');
        checkboxLabel.setAttribute('for', 'close-call-confirm-checkbox');
        checkboxLabel.textContent = 'I understand this action cannot be undone';
        checkboxLabel.style.cssText = `
            color: #d32f2f;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
        `;
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(checkboxLabel);
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 15px;
            justify-content: center;
            width: 100%;
            margin-top: 10px;
        `;
        // Create No button
        const noBtn = document.createElement('button');
        noBtn.textContent = 'No, Cancel';
        noBtn.style.cssText = `
            padding: 12px 24px;
            border: 2px solid #666;
            background: #fff;
            color: #666;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 1rem;
            min-width: 120px;
        `;
        // Create Yes button
        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Yes, Close Call';
        yesBtn.style.cssText = `
            padding: 12px 24px;
            border: none;
            background: #d32f2f;
            color: #fff;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 1rem;
            min-width: 120px;
        `;
        // Assemble modal
        buttonContainer.appendChild(noBtn);
        buttonContainer.appendChild(yesBtn);
        modal.appendChild(warningIcon);
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(checkboxContainer);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        // Event handlers
        function closeModal() {
            overlay.remove();
        }
        // No button - close modal
        noBtn.addEventListener('click', closeModal);
        // Yes button - validate checkbox and proceed
        yesBtn.addEventListener('click', async () => {
            if (!checkbox.checked) {
                showNotification('Please check the confirmation checkbox to proceed.', 'error');
                return;
            }
            // Close modal and proceed with closing the call
            closeModal();
            await executeCloseCall();
        });
        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
        // ESC key to cancel
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        });
    }

    // Execute close call operation: detach all units, then delete call (copied from ambulance.js)
    async function executeCloseCall() {
        if (!selectedCallId) {
            showNotification('No call selected to close.', 'error');
            return;
        }
        const callId = selectedCallId;
        const detachedUnits = [];
        try {
            showNotification('Closing call...', 'info');
            // Step 1: Get all units attached to this call
            const attachedUnitQuery = query(
                collection(db, "attachedUnit"),
                where("callID", "==", callId)
            );
            const attachedUnitSnapshot = await getDocs(attachedUnitQuery);
            // Step 2: Detach all units and move them to availableUnits
            for (const attachedDoc of attachedUnitSnapshot.docs) {
                const unitData = attachedDoc.data();
                const unitId = unitData.unitID;
                if (!unitId) continue;
                try {
                    // Get unit details to check status
                    const unitRef = doc(db, "units", unitId);
                    const unitSnap = await getDoc(unitRef);
                    if (!unitSnap.exists()) continue;
                    const unit = unitSnap.data();
                    const unitStatus = unit.status || 'Unknown';
                    // Remove from attachedUnit collection
                    await deleteDoc(attachedDoc.ref);
                    // Add to availableUnits only if status is not "Unavailable"
                    if (unitStatus !== "Unavailable") {
                        const availableUnitDocRef = doc(db, "availableUnits", unitId);
                        await setDoc(availableUnitDocRef, { unitId: unitId });
                    }
                    detachedUnits.push({ unitId, attachedDocId: attachedDoc.id, callId, unitStatus, originalAttachedData: unitData });
                } catch (unitError) {
                    // Rollback: Re-attach all previously detached units
                    await rollbackDetachedUnits(detachedUnits);
                    showNotification('Failed to detach units from call. Operation cancelled.', 'error');
                    return;
                }
            }
            // Step 3: Delete the call from calls collection
            try {
                const callDocRef = doc(db, "calls", callId);
                await deleteDoc(callDocRef);
                // Step 4: Clear call details section (no rollback needed past this point)
                selectedCallId = null;
                callerName.textContent = "";
                callLocation.textContent = "";
                callStatus.textContent = "";
                callTimestamp.textContent = "";
                attachedUnits.innerHTML = "<p>No Attached Units</p>";
                await loadCalls();
                showNotification(`Call closed successfully. ${detachedUnits.length} units were detached.`, 'success');
            } catch (deleteError) {
                // Rollback: Re-attach all detached units
                await rollbackDetachedUnits(detachedUnits);
                showNotification('Failed to delete call. Operation cancelled.', 'error');
            }
        } catch (error) {
            showNotification('Failed to close call. Please try again.', 'error');
        }
    }

    // Rollback function for detached units (copied from ambulance.js)
    async function rollbackDetachedUnits(detachedUnits) {
        for (const unit of detachedUnits) {
            try {
                // Re-add to attachedUnit collection
                await setDoc(doc(db, "attachedUnit", unit.attachedDocId), unit.originalAttachedData);
                // Remove from availableUnits
                await deleteDoc(doc(db, "availableUnits", unit.unitId));
            } catch (e) {
                // Ignore rollback errors
            }
        }
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
    audio.play().catch(error => {
        // Suppress NotAllowedError and autoplay policy errors (all variations)
        const isNotAllowed = error && (error.name === 'NotAllowedError' || error.code === 20);
        const isAutoplayPolicy = error && typeof error.message === 'string' && (
            error.message.includes("play() failed because the user didn't interact") ||
            error.message.includes('play() failed') ||
            error.message.includes('autoplay policy') ||
            error.message.includes('The play() request was interrupted') ||
            error.message.includes('The play() request was prevented')
        );
        if (!isNotAllowed && !isAutoplayPolicy) {
            console.error(`Error playing sound for ${soundKey}:`, error);
        }
        // Otherwise, suppress error (do not log)
    });
}

// ================== BROADCAST SYSTEM ADDITIONS ==================

// --- Broadcast Firestore Structure ---
// Collection: broadcasts
// Fields: message, recipients (array of unitIDs or 'all', 'police', etc), timestamp, priority ('urgent'|'info'), sender, type, seenBy (array), templateId (optional)



// --- Broadcast Button UI (under New Call) ---
document.addEventListener('DOMContentLoaded', () => {
    const addCallBtn = document.getElementById('addCallBtn');
    if (!addCallBtn) return;
    // Remove old broadcast buttons if present
    document.getElementById('broadcast-btn-row')?.remove();
    document.getElementById('broadcast-multiselect-btn')?.remove();
    // Add new single "Create Broadcast" button
    let createBroadcastBtn = document.getElementById('create-broadcast-btn');
    if (!createBroadcastBtn) {
        createBroadcastBtn = document.createElement('button');
        createBroadcastBtn.id = 'create-broadcast-btn';
        createBroadcastBtn.textContent = 'Create Broadcast';
        createBroadcastBtn.style.background = '#1976d2';
        createBroadcastBtn.style.color = '#fff';
        createBroadcastBtn.style.border = 'none';
        createBroadcastBtn.style.borderRadius = '7px';
        createBroadcastBtn.style.padding = '12px 18px';
        createBroadcastBtn.style.fontWeight = 'bold';
        createBroadcastBtn.style.cursor = 'pointer';
        createBroadcastBtn.style.fontSize = '1em';
        createBroadcastBtn.style.width = '100%';
        createBroadcastBtn.style.boxSizing = 'border-box';
        createBroadcastBtn.style.margin = '12px 0 0 0';
        addCallBtn.parentNode.insertBefore(createBroadcastBtn, addCallBtn.nextSibling);
    }
    createBroadcastBtn.onclick = () => openBroadcastComposer('all');
});

// --- Broadcast Composer Modal ---
function openBroadcastComposer(targetType, prefill = {}) {
    // Only one composer at a time
    let composer = document.getElementById('broadcast-composer-modal');
    if (composer) composer.remove();
    composer = document.createElement('div');
    composer.id = 'broadcast-composer-modal';
    composer.style.position = 'fixed';
    composer.style.top = '0';
    composer.style.left = '0';
    composer.style.width = '100vw';
    composer.style.height = '100vh';
    composer.style.background = 'rgba(0,0,0,0.35)';
    composer.style.display = 'flex';
    composer.style.alignItems = 'center';
    composer.style.justifyContent = 'center';
    composer.style.zIndex = '10002';
    composer.innerHTML = `
        <div style="background:linear-gradient(135deg,#e3f2fd 0%,#fce4ec 100%);padding:0;border-radius:24px;min-width:480px;max-width:98vw;box-shadow:0 12px 48px rgba(30,60,90,0.18);position:relative;">
            <div style="background:linear-gradient(90deg,#1976d2,#388e3c,#d84315,#1565c0);border-radius:24px 24px 0 0;padding:24px 48px 18px 32px;display:flex;align-items:center;gap:18px;">
                <span style="font-size:2.2em;">📢</span>
                <span style="font-size:1.55em;font-weight:700;color:#fff;letter-spacing:1px;text-shadow:0 2px 8px #0002;">Create & Send Broadcast</span>
                <span id="close-broadcast-composer" style="margin-left:auto;font-size:2.2em;cursor:pointer;color:#fff;opacity:0.85;transition:opacity 0.2s;user-select:none;">&times;</span>
            </div>
            <div style="padding:36px 48px 32px 48px;display:flex;flex-direction:column;gap:28px;">
                <div>
                    <label for="broadcast-message" style="font-weight:bold;font-size:1.13em;color:#1976d2;">Broadcast Message</label>
                    <textarea id="broadcast-message" style="width:100%;min-height:90px;resize:vertical;border-radius:10px;border:1.5px solid #bbb;padding:14px;font-size:1.13em;margin-top:8px;" placeholder="Type your broadcast message here...">${prefill.message||''}</textarea>
                </div>
                <div style="display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap;">
                    <div style="flex:1;min-width:180px;">
                        <label for="broadcast-priority" style="font-weight:bold;font-size:1.13em;color:#1976d2;">Priority</label>
                        <select id="broadcast-priority" style="width:100%;margin-top:8px;border-radius:10px;padding:12px 16px;font-size:1.13em;border:1.5px solid #bbb;">
                            <option value="info" ${prefill.priority==='info'?'selected':''}>Info</option>
                            <option value="urgent" ${prefill.priority==='urgent'?'selected':''}>Urgent</option>
                        </select>
                    </div>
                    <div style="flex:2;min-width:260px;">
                        <label style="font-weight:bold;font-size:1.13em;color:#1976d2;">Recipients</label>
                        <div id="recipient-group-btns" style="display:flex;gap:10px;margin:10px 0 14px 0;flex-wrap:wrap;"></div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <input type="text" id="recipient-search-box" placeholder="Search unit callsign..." style="flex:1;padding:12px 16px;font-size:1.13em;border-radius:10px;border:1.5px solid #bbb;">
                            <button id="add-recipient-btn" style="padding:12px 24px;border-radius:10px;background:#1976d2;color:#fff;border:none;font-weight:bold;font-size:1.13em;">Add</button>
                        </div>
                        <div id="recipient-search-results" style="max-height:140px;overflow-y:auto;background:#f7f7f7;border:1.5px solid #bbb;border-radius:10px;margin-top:6px;position:relative;z-index:10021;"></div>
                        <div id="selected-recipients-list" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;"></div>
                    </div>
                </div>
                <div style="display:flex;gap:18px;align-items:center;margin-top:10px;">
                    <button id="send-broadcast-btn" style="background:#1976d2;color:#fff;padding:16px 38px;border:none;border-radius:12px;font-weight:bold;font-size:1.18em;letter-spacing:1px;box-shadow:0 2px 12px #1976d233;">Send Broadcast</button>
                    <button id="save-broadcast-template-btn" style="background:#888;color:#fff;padding:16px 28px;border:none;border-radius:12px;font-weight:bold;font-size:1.13em;">Save as Template</button>
                </div>
                <div id="broadcast-templates-list" style="margin-top:18px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(composer);
    document.getElementById('close-broadcast-composer').onclick = () => composer.remove();

    // --- Recipient selection logic ---
    const groupNames = [
        {label:'All', value:'all', color:'#1976d2'},
        {label:'Police', value:'police', color:'#1565c0'},
        {label:'Ambulance', value:'ambulance', color:'#388e3c'},
        {label:'Fire', value:'fire', color:'#d84315'}
    ];
    let selectedRecipients = [];
    if (prefill.recipients && Array.isArray(prefill.recipients)) {
        selectedRecipients = [...prefill.recipients];
    } else if (targetType) {
        selectedRecipients = [targetType];
    } else {
        selectedRecipients = ['all'];
    }
    const selectedListDiv = document.getElementById('selected-recipients-list');
    function renderSelectedRecipients() {
        selectedListDiv.innerHTML = '';
        selectedRecipients.forEach(rec => {
            let tag = document.createElement('span');
            tag.textContent = rec;
            tag.style.background = groupNames.find(g=>g.value===rec)?.color || '#888';
            tag.style.color = '#fff';
            tag.style.padding = '4px 12px';
            tag.style.borderRadius = '12px';
            tag.style.fontWeight = 'bold';
            tag.style.marginRight = '4px';
            tag.style.display = 'inline-flex';
            tag.style.alignItems = 'center';
            tag.style.gap = '6px';
            let removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.marginLeft = '6px';
            removeBtn.onclick = () => {
                selectedRecipients = selectedRecipients.filter(r=>r!==rec);
                renderSelectedRecipients();
            };
            tag.appendChild(removeBtn);
            selectedListDiv.appendChild(tag);
        });
    }
    renderSelectedRecipients();
    // Group buttons
    const groupBtnsDiv = document.getElementById('recipient-group-btns');
    groupNames.forEach(g => {
        let btn = document.createElement('button');
        btn.textContent = g.label;
        btn.style.background = g.color;
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '7px';
        btn.style.padding = '6px 16px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '1em';
        btn.onclick = () => {
            if (!selectedRecipients.includes(g.value)) {
                selectedRecipients.push(g.value);
                renderSelectedRecipients();
            }
        };
        groupBtnsDiv.appendChild(btn);
    });
    // Search logic (fetch all units from Firestore for searching)
    const searchBox = document.getElementById('recipient-search-box');
    const addBtn = document.getElementById('add-recipient-btn');
    const searchResultsDiv = document.getElementById('recipient-search-results');
    let allUnitsForSearch = [];

    async function fetchAllUnitsForSearch() {
        // Use Firestore to get all units
        try {
            const snapshot = await getDocs(collection(db, 'units'));
            allUnitsForSearch = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (err) {
            allUnitsForSearch = [];
        }
    }

    function updateSearchResults() {
        const val = searchBox.value.trim().toLowerCase();
        searchResultsDiv.innerHTML = '';
        if (!val) return;
        // Only show units not already selected and not unavailable
        const filtered = allUnitsForSearch.filter(u => {
            const callsign = (u.callsign||'').toLowerCase();
            const status = (u.status||'').toLowerCase();
            return callsign.includes(val) && !selectedRecipients.includes(u.callsign) && status !== 'unavailable';
        });
        filtered.slice(0, 20).forEach(u => {
            let res = document.createElement('div');
            res.textContent = u.callsign;
            res.style.padding = '6px 10px';
            res.style.cursor = 'pointer';
            res.style.borderBottom = '1px solid #eee';
            res.onmousedown = () => {
                if (!selectedRecipients.includes(u.callsign)) {
                    selectedRecipients.push(u.callsign);
                    renderSelectedRecipients();
                }
                searchBox.value = '';
                searchResultsDiv.innerHTML = '';
            };
            searchResultsDiv.appendChild(res);
        });
    }

    // Wait for all units to be fetched before enabling search
    fetchAllUnitsForSearch().then(() => {
        searchBox.addEventListener('input', updateSearchResults);
        searchBox.addEventListener('blur', () => setTimeout(()=>{searchResultsDiv.innerHTML='';}, 200));
        searchBox.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const val = searchBox.value.trim().toLowerCase();
                const filtered = allUnitsForSearch.filter(u => {
                    const callsign = (u.callsign||'').toLowerCase();
                    const status = (u.status||'').toLowerCase();
                    return callsign.includes(val) && !selectedRecipients.includes(u.callsign) && status !== 'unavailable';
                });
                if (filtered.length === 1) {
                    selectedRecipients.push(filtered[0].callsign);
                    renderSelectedRecipients();
                    searchBox.value = '';
                    searchResultsDiv.innerHTML = '';
                }
            }
        });
        addBtn.onclick = () => {
            const val = searchBox.value.trim().toLowerCase();
            const filtered = allUnitsForSearch.filter(u => {
                const callsign = (u.callsign||'').toLowerCase();
                const status = (u.status||'').toLowerCase();
                return callsign.includes(val) && !selectedRecipients.includes(u.callsign) && status !== 'unavailable';
            });
            if (filtered.length === 1) {
                selectedRecipients.push(filtered[0].callsign);
                renderSelectedRecipients();
                searchBox.value = '';
                searchResultsDiv.innerHTML = '';
            }
        };
    });

    document.getElementById('send-broadcast-btn').onclick = async () => {
        const msg = document.getElementById('broadcast-message').value.trim();
        const priority = document.getElementById('broadcast-priority').value;
        if (!msg) { alert('Message required.'); return; }
        await sendBroadcast({message:msg,priority,recipients:selectedRecipients.length?selectedRecipients:['all']});
        composer.remove();
    };
    document.getElementById('save-broadcast-template-btn').onclick = () => {
        const msg = document.getElementById('broadcast-message').value.trim();
        const priority = document.getElementById('broadcast-priority').value;
        if (!msg) { alert('Message required.'); return; }
        saveBroadcastTemplate({message:msg,priority,recipients:[...selectedRecipients]});
        alert('Template saved!');
        loadBroadcastTemplates();
    };
    loadBroadcastTemplates();
}

// --- Broadcast Templates ---
function saveBroadcastTemplate(template) {
    let arr = JSON.parse(localStorage.getItem('broadcastTemplates')||'[]');
    arr.push(template);
    localStorage.setItem('broadcastTemplates',JSON.stringify(arr));
}
function loadBroadcastTemplates() {
    let arr = JSON.parse(localStorage.getItem('broadcastTemplates')||'[]');
    const list = document.getElementById('broadcast-templates-list');
    if (!list) return;
    list.innerHTML = '<b>Templates:</b><br>';
    arr.forEach((t,i)=>{
        let btn = document.createElement('button');
        btn.textContent = t.message.slice(0,32)+(t.message.length>32?'...':'');
        btn.style.margin = '2px 4px 2px 0';
        btn.style.padding = '3px 8px';
        btn.style.borderRadius = '5px';
        btn.style.border = 'none';
        btn.style.background = t.priority==='urgent'?'#d32f2f':'#1976d2';
        btn.style.color = '#fff';
        btn.onclick = ()=>openBroadcastComposer('all',t);
        list.appendChild(btn);
        let del = document.createElement('span');
        del.textContent = '🗑️';
        del.style.cursor = 'pointer';
        del.title = 'Delete template';
        del.onclick = ()=>{ arr.splice(i,1); localStorage.setItem('broadcastTemplates',JSON.stringify(arr)); loadBroadcastTemplates(); };
        list.appendChild(del);
    });
}

// --- Send Broadcast (Firestore) ---
async function sendBroadcast({message,priority,recipients}) {
    const sender = getSessionId();
    // Map callsigns to unitIDs (case-insensitive, trimmed)
    let mappedRecipients = [];
    let invalidCallsigns = [];
    // Allow group names (all, police, ambulance, fire) to pass through
    const groupNames = ['all','police','ambulance','fire'];

    // Fetch both available and attached units for mapping
    let allUnitsForBroadcast = [];
    try {
        // Fetch available units
        const availableSnapshot = await getDocs(collection(db, 'units'));
        allUnitsForBroadcast = availableSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Fetch attached units (from attachedUnit collection)
        const attachedSnapshot = await getDocs(collection(db, 'attachedUnit'));
        for (const docSnap of attachedSnapshot.docs) {
            const attachedData = docSnap.data();
            const unitId = attachedData.unitID || attachedData.unitId;
            if (!unitId) continue;
            // Fetch the unit details from 'units' collection
            try {
                const unitRef = doc(db, 'units', unitId);
                const unitSnap = await getDoc(unitRef);
                if (unitSnap.exists()) {
                    // Only add if not already in the list
                    if (!allUnitsForBroadcast.some(u => u.id === unitId)) {
                        allUnitsForBroadcast.push({ id: unitId, ...unitSnap.data() });
                    }
                }
            } catch (e) { /* ignore */ }
        }
    } catch (e) {
        // fallback: just use allUnits if fetch fails
        allUnitsForBroadcast = allUnits;
    }

    if (Array.isArray(recipients)) {
        recipients.forEach(cs => {
            const trimmed = cs.trim().toLowerCase();
            if (groupNames.includes(trimmed)) {
                mappedRecipients.push(trimmed);
                return;
            }
            // Find unit by callsign (case-insensitive)
            const match = allUnitsForBroadcast.find(u => (u.callsign||'').trim().toLowerCase() === trimmed);
            if (match && match.id) {
                mappedRecipients.push(match.id);
            } else {
                invalidCallsigns.push(cs);
            }
        });
    }
    if (mappedRecipients.length === 0 && invalidCallsigns.length > 0) {
        alert('No valid recipients found. Please check callsigns.');
        return;
    }
    if (invalidCallsigns.length > 0) {
        showNotification('Some callsigns not found: ' + invalidCallsigns.join(', '), 'warning');
    }
    const docData = {
        message,
        priority,
        recipients: mappedRecipients.length ? mappedRecipients : ['all'],
        sender,
        timestamp: new Date(),
        seenBy: [],
        // Optionally, for debugging/history, include original callsigns
        originalCallsigns: recipients
    };
    await addDoc(collection(db,'broadcasts'),docData);
}


// --- Right-click Context Menu for Private Broadcasts ---
document.addEventListener('DOMContentLoaded',()=>{
    document.body.addEventListener('contextmenu',function(e){
        const unitCard = e.target.closest('.unit-card');
        if (!unitCard) return;
        e.preventDefault();
        let menu = document.getElementById('unit-context-menu');
        if (menu) menu.remove();
        menu = document.createElement('div');
        menu.id = 'unit-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = e.pageX+'px';
        menu.style.top = e.pageY+'px';
        menu.style.background = '#222';
        menu.style.color = '#fff';
        menu.style.padding = '8px 18px';
        menu.style.borderRadius = '8px';
        menu.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
        menu.style.zIndex = '10010';
        menu.style.cursor = 'pointer';
        menu.innerHTML = '<div id="broadcast-private-btn">Broadcast (Private)</div>';
        document.body.appendChild(menu);
        document.getElementById('broadcast-private-btn').onclick = ()=>{
            // Use callsign instead of unitId
            openBroadcastComposer('private',{recipients:[unitCard.querySelector('.unit-callsign-box')?.textContent?.trim()||'']});
            menu.remove();
        };
        document.body.onclick = ()=>{if(menu)menu.remove();};
    });
});

// --- Multi-Unit Private Broadcasts (Shift+Click to select) ---
let multiSelectedCallsigns = [];
document.addEventListener('DOMContentLoaded',()=>{
    document.body.addEventListener('click',function(e){
        const unitCard = e.target.closest('.unit-card');
        if (!unitCard) return;
        const callsign = unitCard.querySelector('.unit-callsign-box')?.textContent?.trim();
        if (!callsign) return;
        if (e.shiftKey) {
            // Multi-select
            if (!multiSelectedCallsigns.includes(callsign)) {
                multiSelectedCallsigns.push(callsign);
                unitCard.classList.add('multi-selected-unit');
            } else {
                multiSelectedCallsigns = multiSelectedCallsigns.filter(cs=>cs!==callsign);
                unitCard.classList.remove('multi-selected-unit');
            }
        } else {
            // Single select
            multiSelectedCallsigns.forEach(cs=>{
                let el = Array.from(document.querySelectorAll('.unit-card')).find(card=>card.querySelector('.unit-callsign-box')?.textContent?.trim()===cs);
                if (el) el.classList.remove('multi-selected-unit');
            });
            multiSelectedCallsigns = [];
        }
    });
    // Remove the old "Broadcast to Select Units" button if present
    let oldBtn = document.getElementById('broadcast-multiselect-btn');
    if (oldBtn) oldBtn.remove();
    // Add a floating Broadcast History button
    let historyBtn = document.getElementById('broadcast-history-btn');
    if (!historyBtn) {
        historyBtn = document.createElement('button');
        historyBtn.id = 'broadcast-history-btn';
        historyBtn.textContent = '📢 History';
        historyBtn.title = 'Show Broadcast History';
        historyBtn.style.position = 'fixed';
        historyBtn.style.bottom = '70px';
        historyBtn.style.right = '24px';
        historyBtn.style.background = '#1976d2';
        historyBtn.style.color = '#fff';
        historyBtn.style.padding = '10px 22px';
        historyBtn.style.borderRadius = '10px';
        historyBtn.style.fontWeight = 'bold';
        historyBtn.style.zIndex = '10011';
        historyBtn.style.cursor = 'pointer';
        document.body.appendChild(historyBtn);
    }
    historyBtn.onclick = () => openBroadcastHistoryModal();
// --- Broadcast History Modal (Dispatcher) ---
function openBroadcastHistoryModal() {
    let modal = document.getElementById('broadcast-history-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'broadcast-history-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.38)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10020';
    modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#e3f2fd 0%,#fce4ec 100%);padding:0;border-radius:20px;min-width:360px;max-width:98vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(30,60,90,0.18);position:relative;">
        <div style="background:linear-gradient(90deg,#1976d2,#388e3c,#d84315,#1565c0);border-radius:20px 20px 0 0;padding:18px 38px 14px 24px;display:flex;align-items:center;gap:14px;">
            <span style="font-size:2em;">📢</span>
            <span style="font-size:1.35em;font-weight:700;color:#fff;letter-spacing:1px;text-shadow:0 2px 8px #0002;">Broadcast History</span>
            <span id="close-broadcast-history-modal" style="margin-left:auto;font-size:2em;cursor:pointer;color:#fff;opacity:0.85;transition:opacity 0.2s;user-select:none;">&times;</span>
        </div>
        <div style="padding:24px 32px 18px 32px;">
            <div id="broadcast-history-list" style="font-size:1.08em;"></div>
        </div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('close-broadcast-history-modal').onclick = ()=>modal.remove();
    // Load and render broadcast history
    loadBroadcastHistoryList();
}

// --- Load and Render Broadcast History List ---
async function loadBroadcastHistoryList() {
    const list = document.getElementById('broadcast-history-list');
    if (!list) return;
    // Fetch broadcasts from Firestore
    try {
        const broadcastsRef = collection(db, 'broadcasts');
        const snapshot = await getDocs(broadcastsRef);
        let broadcasts = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            broadcasts.push({id: docSnap.id, ...data});
        });
        broadcasts.sort((a,b)=>{
            const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return tb - ta;
        });
        // Filter out broadcasts with blank/undefined message or placeholder
        const filtered = broadcasts.filter(b => {
            const msg = (b.message||'').trim();
            return msg && b.placeholder !== true;
        });
        if (!filtered.length) {
            list.innerHTML = '<div style="color:#888;">No broadcasts sent.</div>';
            return;
        }
        list.innerHTML = filtered.map(b=>
            `<div style="border-bottom:1px solid #eee;padding:10px 0;">
                <div style="font-size:1.1em;font-weight:bold;">${b.message}</div>
                <div><b>Priority:</b> ${b.priority||'info'} | <b>From:</b> ${b.sender||'DISPATCH'}</div>
                <div><b>Recipients:</b> ${(b.recipients||[]).join(', ')}</div>
                <div><b>Time:</b> ${formatBroadcastTime(b.timestamp)}</div>
            </div>`
        ).join('');
    } catch (err) {
        list.innerHTML = '<div style="color:#888;">Failed to load broadcast history.</div>';
    }
}

function formatBroadcastTime(ts) {
    if (!ts) return '';
    let d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
}
});

// --- Multi-Unit Callsign Selection Modal ---
function openUnitMultiSelectModal() {
    // Remove any existing modal
    let modal = document.getElementById('unit-multiselect-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'unit-multiselect-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.38)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10020';
    modal.innerHTML = `
        <div style="background:#fff;padding:32px 38px;border-radius:16px;min-width:340px;max-width:98vw;box-shadow:0 4px 24px rgba(0,0,0,0.18);position:relative;">
            <span style="position:absolute;top:10px;right:16px;font-size:1.5em;cursor:pointer;" id="close-unit-multiselect-modal">&times;</span>
            <h2 style="margin-bottom:10px;">Select Recipients</h2>
            <div style="margin-bottom:10px;">
                <input id="callsign-search-box" type="text" placeholder="Enter callsign..." style="width:70%;padding:7px 12px;font-size:1em;border-radius:7px;border:1px solid #bbb;">
                <button id="add-callsign-btn" style="margin-left:8px;padding:7px 18px;border-radius:7px;background:#1976d2;color:#fff;border:none;font-weight:bold;">Add</button>
            </div>
            <div id="selected-callsigns-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;"></div>
            <button id="save-multiselect-callsigns-btn" style="background:#388e3c;color:#fff;padding:10px 22px;border:none;border-radius:7px;font-weight:bold;font-size:1em;">Save & Compose Message</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-unit-multiselect-modal').onclick = ()=>modal.remove();

    let selectedCallsigns = [];
    const listDiv = document.getElementById('selected-callsigns-list');
    function renderSelectedTiles() {
        listDiv.innerHTML = '';
        selectedCallsigns.forEach(cs => {
            const tile = document.createElement('span');
            tile.textContent = cs;
            tile.style.background = '#1976d2';
            tile.style.color = '#fff';
            tile.style.padding = '6px 14px';
            tile.style.borderRadius = '16px';
            tile.style.fontWeight = 'bold';
            tile.style.fontSize = '1em';
            tile.style.display = 'inline-block';
            tile.style.marginRight = '4px';
            tile.style.cursor = 'pointer';
            tile.title = 'Remove';
            tile.onclick = () => {
                selectedCallsigns = selectedCallsigns.filter(c => c !== cs);
                renderSelectedTiles();
            };
            listDiv.appendChild(tile);
        });
    }

    // --- Callsign Search UI ---
    const searchBox = document.getElementById('callsign-search-box');
    const addBtn = document.getElementById('add-callsign-btn');
    // Add a dropdown for search results
    let searchResultsDiv = document.createElement('div');
    searchResultsDiv.id = 'callsign-search-results';
    searchResultsDiv.style.maxHeight = '120px';
    searchResultsDiv.style.overflowY = 'auto';
    searchResultsDiv.style.background = '#f7f7f7';
    searchResultsDiv.style.border = '1px solid #bbb';
    searchResultsDiv.style.borderRadius = '7px';
    searchResultsDiv.style.marginTop = '4px';
    searchResultsDiv.style.position = 'absolute';
    searchResultsDiv.style.width = '70%';
    searchResultsDiv.style.zIndex = '10021';
    searchBox.parentNode.appendChild(searchResultsDiv);

    function updateSearchResults() {
        const val = searchBox.value.trim().toLowerCase();
        searchResultsDiv.innerHTML = '';
        if (!val) return;
        // Only show units not already selected
        const filtered = allUnits.filter(u => (u.callsign||'').toLowerCase().includes(val) && !selectedCallsigns.includes(u.callsign));
        filtered.slice(0, 20).forEach(u => {
            const res = document.createElement('div');
            res.textContent = u.callsign;
            res.style.padding = '6px 12px';
            res.style.cursor = 'pointer';
            res.style.borderBottom = '1px solid #eee';
            res.onmouseenter = () => res.style.background = '#e3e3e3';
            res.onmouseleave = () => res.style.background = '';
            res.ondblclick = () => {
                if (!selectedCallsigns.includes(u.callsign)) {
                    selectedCallsigns.push(u.callsign);
                    renderSelectedTiles();
                }
                searchBox.value = '';
                searchResultsDiv.innerHTML = '';
            };
            searchResultsDiv.appendChild(res);
        });
    }
    searchBox.addEventListener('input', updateSearchResults);
    // Hide results on blur (with slight delay for click)
    searchBox.addEventListener('blur', () => setTimeout(()=>{searchResultsDiv.innerHTML='';}, 200));
    // Add on double click (already handled above)
    // Add on Enter if only one result
    searchBox.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const val = searchBox.value.trim().toLowerCase();
            const filtered = allUnits.filter(u => (u.callsign||'').toLowerCase().includes(val) && !selectedCallsigns.includes(u.callsign));
            if (filtered.length === 1) {
                selectedCallsigns.push(filtered[0].callsign);
                renderSelectedTiles();
                searchBox.value = '';
                searchResultsDiv.innerHTML = '';
            }
        }
    });
    // Add button adds if only one result
    addBtn.onclick = () => {
        const val = searchBox.value.trim().toLowerCase();
        const filtered = allUnits.filter(u => (u.callsign||'').toLowerCase().includes(val) && !selectedCallsigns.includes(u.callsign));
        if (filtered.length === 1) {
            selectedCallsigns.push(filtered[0].callsign);
            renderSelectedTiles();
            searchBox.value = '';
            searchResultsDiv.innerHTML = '';
        } else if (filtered.length > 1) {
            showNotification('Type more to narrow down to one unit.', 'warning');
        } else {
            showNotification('No matching unit found.', 'warning');
        }
    };
    document.getElementById('save-multiselect-callsigns-btn').onclick = () => {
        if (!selectedCallsigns.length) { alert('Add at least one callsign.'); return; }
        modal.remove();
        openBroadcastComposer('private',{recipients:selectedCallsigns});
    };
}

// --- Read Receipt/Seen Indicator (for future expansion) ---
// When modal is shown, mark as seen (add to seenBy array in Firestore)
// (Implementation for seen indicator in UI can be added in next steps)

// ================== END BROADCAST SYSTEM ADDITIONS ==================

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
