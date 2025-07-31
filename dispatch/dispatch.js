// --- Logging Utility ---
import { logUserAction } from "../firebase/logUserAction.js";

// Usage: logUserAction(db, action, details)
// Make sure to pass the Firestore db instance as the first argument in all calls.
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
callServiceFilter.addEventListener('change', async () => {
    const selectedService = callServiceFilter.value;
    await logUserAction(db, 'change_call_service_filter', { value: selectedService });
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
unitTypeFilter.addEventListener('change', async () => {
    await logUserAction(db, 'change_unit_type_filter', { value: unitTypeFilter.value });
    filterUnits();
});
unitCallsignSearch.addEventListener('input', async () => {
    await logUserAction(db, 'unit_callsign_search', { value: unitCallsignSearch.value });
    filterUnits();
});

// --- Log errors globally ---
window.addEventListener('error', async (event) => {
    await logUserAction(db, 'error', { message: event.message, source: event.filename, lineno: event.lineno, colno: event.colno });
});
window.addEventListener('unhandledrejection', async (event) => {
    await logUserAction(db, 'unhandledrejection', { reason: event.reason });
});

// Fix `loadCalls` to render attached units for each call
async function loadCalls() {
    try {
        console.log("Loading calls...");
        const snapshot = await getDocs(collection(db, "calls")); // Fetch all documents
        const calls = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(call => !call.placeholder); // Exclude placeholder calls

        console.log(`Loaded ${calls.length} calls`);

        if (calls.length === 0) {
            callsList.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
            allCalls = []; // Ensure allCalls is empty array, not undefined
            return;
        }

        allCalls = calls; // Store all calls globally
        console.log("allCalls populated with", allCalls.length, "calls");
        
        displayCalls(allCalls); // Render the fetched calls
        
        // Give the DOM a moment to update, then trigger attached units rendering
        setTimeout(() => {
            console.log("Triggering initial attached units refresh after loadCalls");
            // This will be handled by the listener's initial refresh
        }, 100);

        // Real-time listeners will keep attached units up-to-date after this
    } catch (error) {
        console.error("Error fetching calls collection:", error);
        callsList.innerHTML = '<p>Error loading calls. Please try again later.</p>';
        allCalls = []; // Ensure allCalls is empty array on error
    }
}

// Fix `renderAttachedUnitsForCall` to ensure attached units are displayed correctly
async function renderAttachedUnitsForCall(callId) {
    if (!callId) {
        console.error("renderAttachedUnitsForCall called with invalid callId:", callId);
        return;
    }
    
    // Try multiple times to find the container in case of DOM timing issues
    let attachedUnitsContainer = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!attachedUnitsContainer && attempts < maxAttempts) {
        attachedUnitsContainer = document.getElementById(`attached-units-${callId}`);
        if (!attachedUnitsContainer) {
            console.warn(`Container not found for call ${callId} on attempt ${attempts + 1}/${maxAttempts}`);
            attempts++;
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else {
            break;
        }
    }
    
    if (!attachedUnitsContainer) {
        console.error(`Container not found for call ${callId} after ${maxAttempts} attempts`);
        return;
    }

    console.log(`Rendering attached units for call ${callId}`);

    // Defensive: Remove all child nodes (not just innerHTML)
    while (attachedUnitsContainer.firstChild) {
        attachedUnitsContainer.removeChild(attachedUnitsContainer.firstChild);
    }

    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("callID", "==", callId)
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        console.log(`Found ${attachedUnitSnapshot.docs.length} attached units for call ${callId}`);

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
            const attachedUnitData = docSnap.data();
            const { unitID } = attachedUnitData;
            
            if (!unitID) {
                console.warn(`Attached unit document missing unitID:`, attachedUnitData);
                continue;
            }
            
            if (seenUnitIDs.has(unitID)) {
                console.log(`Skipping duplicate unitID ${unitID} for call ${callId}`);
                continue;
            }
            
            seenUnitIDs.add(unitID);
            
            try {
                const unitRef = doc(db, "units", unitID);
                const unitSnap = await getDoc(unitRef);
                if (!unitSnap.exists()) {
                    console.warn(`Unit with ID ${unitID} not found in units collection.`);
                    continue;
                }
                const unitData = unitSnap.data();
                const callsign = (unitData.callsign || 'N/A').trim();
                pillsArr.push({ callsign, unitData, unitID });
                console.log(`Added unit ${callsign} (${unitID}) to pills array for call ${callId}`);
            } catch (unitError) {
                console.error(`Error fetching unit ${unitID}:`, unitError);
            }
        }

        if (pillsArr.length === 0) {
            console.log(`No valid units found for call ${callId}, showing "No Attached Units"`);
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

        // Sort by service, then callsign
        pillsArr.sort((a, b) => {
            const serviceA = (a.unitData.unitType || '').toLowerCase();
            const serviceB = (b.unitData.unitType || '').toLowerCase();
            if (serviceA < serviceB) return -1;
            if (serviceA > serviceB) return 1;
            return (a.callsign || '').localeCompare(b.callsign || '');
        });
        
        // Create and append unit pills
        for (const { callsign, unitData, unitID } of pillsArr) {
            const service = unitData.unitType ? unitData.unitType : '';
            const pill = document.createElement('div');
            pill.className = 'all-calls-unit-pill';
            pill.textContent = service ? `${callsign} (${service})` : callsign;
            pill.setAttribute('data-unit-id', unitID);
            
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
                    console.warn(`Error applying status color for unit ${unitID}:`, e);
                }
            }
            
            attachedUnitsContainer.appendChild(pill);
            console.log(`Added pill for unit ${callsign} to call ${callId}`);
        }
        
        console.log(`Successfully rendered ${pillsArr.length} attached units for call ${callId}`);
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
        callCard.addEventListener('click', async () => {
            await logUserAction(db, 'select_call', {
                callId: call.id,
                callerName: call.callerName,
                location: call.location,
                status: call.status,
                service: call.service,
                description: call.description,
                callType: call.callType
            });
            selectCall(call);
        });

        callsList.appendChild(callCard);
    });

    // Attached units will be rendered by the real-time listener (listenForAttachedUnitsUpdates)
    // But add a backup to ensure they are rendered even if the listener is delayed
    setTimeout(async () => {
        console.log("Backup: Checking if attached units need to be rendered for all calls");
        for (const call of calls) {
            const container = document.getElementById(`attached-units-${call.id}`);
            if (container && container.children.length === 0) {
                console.log(`Backup: Rendering attached units for call ${call.id} (container was empty)`);
                try {
                    await renderAttachedUnitsForCall(call.id);
                } catch (error) {
                    console.error(`Backup: Error rendering attached units for call ${call.id}:`, error);
                }
            }
        }
    }, 100);
}

// Helper to refresh all attached units for all calls (can be called after DOM is ready)
// Removed refreshAllAttachedUnits; all attached units are now handled by the real-time listener only.

// Add a real-time listener for the selected call's details
function listenForSelectedCallUpdates() {
    if (!selectedCallId) return;

    const callDocRef = doc(db, "calls", selectedCallId);
    let isInitialCallDetailsSnapshot = true;

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
            
            // Play new note sound when call details are updated (skip initial snapshot)
            if (!isInitialCallDetailsSnapshot) {
                playSound("newnote");
                console.log("Call details updated by any user - playing newnote sound");
            } else {
                isInitialCallDetailsSnapshot = false;
            }
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

        // Play sound when selecting a call
        playSound("newnote");

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

    // Defensive: Remove all child nodes (not just innerHTML)
    while (attachedUnitsContainer.firstChild) {
        attachedUnitsContainer.removeChild(attachedUnitsContainer.firstChild);
    }

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
        // Defensive deduplication: check DOM for existing unitID before appending
        attachedUnitsContainer.querySelectorAll('[data-unit-id]').forEach(el => {
            renderedUnitIds.add(el.getAttribute('data-unit-id'));
        });
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
            unitDiv.setAttribute('data-unit-id', unitID);
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
async function selectUnit(unitElement, section) {
    if (selectedUnit) selectedUnit.classList.remove('selected-unit'); // Deselect the previously selected unit
    selectedUnit = unitElement; // Set the new selected unit
    selectedUnitSection = section; // Track the section (e.g., 'manage' or 'attached')
    selectedUnit.classList.add('selected-unit'); // Highlight the selected unit

    // Log unit selection
    await logUserAction(db, 'select_unit', {
        unitId: selectedUnit.dataset.unitId,
        section,
        callsign: selectedUnit.querySelector('.unit-callsign-box')?.textContent || 'N/A',
        status: selectedUnit.querySelector('.unit-status-label')?.textContent || 'Unknown',
        specificType: selectedUnit.querySelector('.unit-specific-type')?.textContent || ''
    });
}

// Add a real-time listener for the `calls` collection to update saved details across tabs
function listenForCallUpdates() {
    const callsRef = collection(db, "calls");
    let isInitialCallSnapshot = true;

    // Listen for changes in the "calls" collection
    onSnapshot(
        callsRef,
        async (snapshot) => {
            if (isInitialCallSnapshot) {
                isInitialCallSnapshot = false;
                return; // Skip the first snapshot to avoid duplicate rendering
            }
            console.log("Snapshot received for calls collection.");
            const updatedCalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Identify truly new calls
            const newCallIds = updatedCalls
                .filter(call => !allCalls.some(existingCall => existingCall.id === call.id))
                .map(call => call.id);

            // Identify closed/removed calls (but don't play sound if current user closed it)
            const removedCallIds = allCalls
                .filter(existingCall => !updatedCalls.some(call => call.id === existingCall.id))
                .map(call => call.id);
            
            // Get the actual removed call objects before updating allCalls
            const removedCalls = allCalls
                .filter(existingCall => !updatedCalls.some(call => call.id === existingCall.id));

            // Update the global calls array
            allCalls = updatedCalls;
            console.log("Global allCalls length after update:", allCalls.length);

            displayCalls(allCalls); // Re-render the calls list

            // Play sound only for truly new calls (always play for new calls regardless of selection)
            if (newCallIds.length > 0) {
                // Check if any of the new calls are panic calls
                const newCalls = updatedCalls.filter(call => newCallIds.includes(call.id));
                const hasPanicCall = newCalls.some(call => call.isPanicCall === true);
                
                if (hasPanicCall) {
                    playSound("panictones");
                    console.log(`Panic call detected: ${newCallIds.join(", ")} - playing panic tones`);
                } else {
                    playSound("newcall");
                    console.log(`New calls detected: ${newCallIds.join(", ")} - playing new call sound`);
                }
            }

            // Play close call sound ONLY if the selected call was closed
            if (removedCallIds.length > 0) {
                // Check if any of the removed calls were panic calls
                const hasPanicCallRemoved = removedCalls.some(call => call.isPanicCall === true);
                
                if (hasPanicCallRemoved) {
                    // Play panic end sound for all users when panic call is removed
                    playSound("tones");
                    console.log(`Panic call removed: ${removedCallIds.join(", ")} - playing tones sound`);
                } else {
                    // Check if the selected call was among the removed calls
                    const selectedCallWasClosed = selectedCallId && removedCallIds.includes(selectedCallId);
                    
                    if (selectedCallWasClosed) {
                        // Only play sound if the selected call was closed by another user
                        const isCurrentUserClosing = window.isClosingCall;
                        
                        if (!isCurrentUserClosing) {
                            playSound("callclosed");
                            console.log(`Selected call ${selectedCallId} was closed by another user - playing callclosed sound`);
                        } else {
                            console.log(`Selected call ${selectedCallId} was closed by current user, no sound played`);
                        }
                    } else {
                        console.log(`Calls closed but not the selected call, no sound played: ${removedCallIds.join(", ")}`);
                    }
                }
                
                // Reset the flag
                window.isClosingCall = false;
            }

            // IMPORTANT: After the calls list is updated, we need to refresh attached units
            // Wait a moment for DOM to update, then trigger attached units refresh
            setTimeout(() => {
                console.log("Triggering attached units refresh after calls update");
                triggerAttachedUnitsRefresh();
            }, 500);

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

// --- PANIC ALERT REAL-TIME LISTENER FOR DISPATCH ---
(function setupPanicAlertsListener() {
    console.log('[DISPATCH PANIC] Setting up panic alerts listener for dispatch');
    const panicAlertsRef = collection(db, 'panicAlerts');
    let lastPanicDocIds = [];
    let lastSelectedTab = 0;

    onSnapshot(panicAlertsRef, (snapshot) => {
        console.log('[DISPATCH PANIC] Panic alerts listener triggered, snapshot size:', snapshot.size);
        // Gather all valid panic alerts except placeholders
        const panicUnits = [];
        const currentPanicDocIds = [];
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Debug log each panic alert
            console.log('[DISPATCH PANIC] Found panic alert:', data);
            // Filtering: ignore only empty, null, undefined, 'None', 'placeholder' (case-insensitive)
            if (
                data.unitId &&
                typeof data.unitId === 'string' &&
                data.unitId.trim() !== '' &&
                data.unitId.toLowerCase() !== 'none' &&
                data.unitId.toLowerCase() !== 'placeholder'
            ) {
                console.log('[DISPATCH PANIC] --> PASSES FILTER, will be shown in popup');
                panicUnits.push({ ...data, docId: docSnap.id });
                currentPanicDocIds.push(docSnap.id);
            } else {
                console.log('[DISPATCH PANIC] --> FILTERED OUT');
            }
        });
        
        console.log('[DISPATCH PANIC] Filtered panic units:', panicUnits);
        console.log('[DISPATCH PANIC] Current panic doc IDs:', currentPanicDocIds);
        console.log('[DISPATCH PANIC] Last panic doc IDs:', lastPanicDocIds);
        
        // Detect new panic alerts
        const newPanicIds = currentPanicDocIds.filter(id => !lastPanicDocIds.includes(id));
        if (newPanicIds.length > 0) {
            console.log('[DISPATCH PANIC] New panic alerts detected:', newPanicIds);
            // For dispatch, show all panic alerts regardless of source
            console.log('[DISPATCH PANIC] Playing panic sound for new panic alerts');
            // Sound is already handled by listenForCallUpdates when panic calls are created
        }
        
        // Detect removed panic alerts
        const removedPanicIds = lastPanicDocIds.filter(id => !currentPanicDocIds.includes(id));
        if (removedPanicIds.length > 0) {
            console.log('[DISPATCH PANIC] Panic alerts removed:', removedPanicIds);
            
            if (currentPanicDocIds.length === 0) {
                console.log('[DISPATCH PANIC] All panic alerts cleared, UI updated');
            } else {
                console.log('[DISPATCH PANIC] Some panic alerts cleared (but others remain), UI updated');
            }
        }
        
        // If there are any, show the popup with tabs
        if (panicUnits.length > 0) {
            // Try to keep the same tab selected if possible
            let selectedTab = lastSelectedTab;
            if (selectedTab >= panicUnits.length) selectedTab = 0;
            showPanicPopupTabs(panicUnits, selectedTab);
            lastPanicDocIds = currentPanicDocIds;
            lastSelectedTab = selectedTab;
        } else {
            removePanicPopup();
            lastPanicDocIds = [];
            lastSelectedTab = 0;
        }
    });

    // Show a popup/modal for one or more panic alerts, with tabs
    function showPanicPopupTabs(panicUnits, selectedTab) {
        removePanicPopup();
        // Create popup
        const popup = document.createElement('div');
        popup.id = 'panic-popup';
        popup.style.position = 'fixed';
        popup.style.bottom = '32px';
        popup.style.right = '32px';
        popup.style.zIndex = '2000';
        popup.style.background = '#fff';
        popup.style.border = '3px solid #ff2222';
        popup.style.borderRadius = '16px';
        popup.style.boxShadow = '0 8px 32px rgba(255,0,0,0.18)';
        popup.style.padding = '28px 36px 18px 36px';
        popup.style.minWidth = '320px';
        popup.style.maxWidth = '90vw';
        popup.style.fontSize = '1.18rem';
        popup.style.fontWeight = '700';
        popup.style.color = '#b71c1c';
        popup.style.display = 'flex';
        popup.style.flexDirection = 'column';
        popup.style.alignItems = 'center';
        popup.style.gap = '12px';

        // Tabs if more than one
        let tabsHtml = '';
        if (panicUnits.length > 1) {
            tabsHtml = '<div id="panic-tabs" style="display:flex;gap:8px;margin-bottom:10px;">';
            for (var i = 0; i < panicUnits.length; i++) {
                var unit = panicUnits[i];
                var btnStyle = (i === selectedTab) ? 'background:#ff2222;color:#fff;' : 'background:#eee;color:#b71c1c;';
                tabsHtml += '<button class="panic-tab-btn" data-tab="' + i + '" style="padding:6px 18px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;' + btnStyle + '">' + (unit.callsign || 'Unknown') + '</button>';
            }
            tabsHtml += '</div>';
        }

        // Main content for selected tab
        var unit = panicUnits[selectedTab];
        var contentHtml = '';
        contentHtml += '<div style="font-size:2rem;color:#ff2222;font-weight:bold;">PANIC ALERT</div>';
        contentHtml += '<div style="font-size:1.1rem;color:#b71c1c;">Unit: <b>' + (unit.callsign || 'Unknown') + '</b></div>';
        contentHtml += '<div style="font-size:1.1rem;color:#b71c1c;">Service: <b>' + (unit.service || 'Unknown') + '</b></div>';
        contentHtml += '<div style="font-size:1.1rem;color:#b71c1c;">Location: <b>' + (unit.callLocation || 'Unknown') + '</b></div>';
        
        contentHtml += '<button id="panic-popup-minimize" style="margin-top:10px;padding:8px 18px;border-radius:8px;background:#ff2222;color:#fff;font-weight:bold;border:none;cursor:pointer;">Minimize</button>';
        popup.innerHTML = tabsHtml + contentHtml;
        document.body.appendChild(popup);

        // Tab switching
        if (panicUnits.length > 1) {
            popup.querySelectorAll('.panic-tab-btn').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.getAttribute('data-tab'));
                    lastSelectedTab = idx;
                    showPanicPopupTabs(panicUnits, idx);
                };
            });
        }

        // Minimize button
        document.getElementById('panic-popup-minimize').onclick = function() {
            popup.style.display = 'none';
            // Add a mini button to restore
            if (!document.getElementById('panic-mini-btn')) {
                const miniBtn = document.createElement('button');
                miniBtn.id = 'panic-mini-btn';
                miniBtn.textContent = 'See Active PANIC Units';
                miniBtn.style.position = 'fixed';
                miniBtn.style.bottom = '32px';
                miniBtn.style.right = '32px';
                miniBtn.style.zIndex = '2001';
                miniBtn.style.background = '#ff2222';
                miniBtn.style.color = '#fff';
                miniBtn.style.fontWeight = 'bold';
                miniBtn.style.border = 'none';
                miniBtn.style.borderRadius = '12px';
                miniBtn.style.padding = '14px 24px';
                miniBtn.style.fontSize = '1.1rem';
                miniBtn.style.boxShadow = '0 4px 16px rgba(255,0,0,0.18)';
                miniBtn.onclick = function() {
                    popup.style.display = 'flex';
                    miniBtn.remove();
                };
                document.body.appendChild(miniBtn);
            }
        };
    }

    // Remove the popup and mini button
    function removePanicPopup() {
        const popup = document.getElementById('panic-popup');
        if (popup) popup.remove();
        const mini = document.getElementById('panic-mini-btn');
        if (mini) mini.remove();
    }
})();

// Add a real-time listener for the `units` collection to update the Manage Units section
function listenForUnitStatusUpdates() {
    const unitsRef = collection(db, "units");
    let isInitialUnitsSnapshot = true;
    
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
                    // Play call update sound when attached unit status changes (skip initial snapshot)
                    if (!isInitialUnitsSnapshot) {
                        playSound("callupdate");
                        console.log("Attached unit status changed by any user - playing callupdate sound");
                    }
                }
            }
            
            // Mark that we've processed the initial snapshot
            if (isInitialUnitsSnapshot) {
                isInitialUnitsSnapshot = false;
            }
        } catch (error) {
            console.error("Error processing units snapshot:", error);
        }
    }, (error) => {
        console.error("Error listening for units updates:", error);
    });
}

// Flags to prevent duplicate listeners
let listenersInitialized = false;

// Global function to trigger attached units refresh (will be overridden by the listener)
window.triggerAttachedUnitsRefresh = async function() {
    console.log("triggerAttachedUnitsRefresh called before listener setup - this is normal during initialization");
};

// Flag to prevent duplicate close call sound when current user closes a call
window.isClosingCall = false;

// Ensure all real-time listeners are initialized on page load
document.addEventListener("DOMContentLoaded", async () => {
    if (listenersInitialized) return; // Prevent duplicate initialization
    listenersInitialized = true;
    
    console.log("Initializing dispatch page listeners...");
    
    // Ensure allCalls is populated before listeners that depend on it
    await loadAvailableUnits(); // Load available units initially
    console.log("Available units loaded");
    
    await loadCalls(); // Load calls (populates allCalls)
    console.log("Calls loaded, allCalls length:", allCalls?.length || 0);
    
    // Start listeners
    listenForCallUpdates(); // Start listening for real-time updates to calls
    listenForAvailableUnitsUpdates(); // Start listening for real-time updates to available units
    listenForAttachedUnitsUpdates(); // Start listening for real-time updates to attached units
    listenForUnitStatusUpdates(); // Start listening for real-time updates to unit status
    
    console.log("All listeners initialized");
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
    let isProcessing = false;
    let isInitialAttachedUnitsSnapshot = true;

    // Function to refresh all attached units
    async function refreshAllAttachedUnits() {
        if (isProcessing) return; // Prevent concurrent processing
        isProcessing = true;
        
        try {
            console.log("Refreshing attached units for all calls...");
            
            // Wait for DOM to be ready and ensure allCalls is populated
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Ensure we have calls to work with
            if (!allCalls || allCalls.length === 0) {
                console.warn("No calls available for attached units rendering");
                isProcessing = false;
                return;
            }
            
            console.log(`Processing attached units for ${allCalls.length} calls`);
            
            // Refresh attached units for all calls in the "All Calls" section
            for (let i = 0; i < allCalls.length; i++) {
                const call = allCalls[i];
                const container = document.getElementById(`attached-units-${call.id}`);
                if (container) {
                    console.log(`Rendering attached units for call ${call.id} (${i + 1}/${allCalls.length})`);
                    try {
                        await renderAttachedUnitsForCall(call.id);
                        // Add a small delay between calls to prevent overwhelming the database
                        if (i < allCalls.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    } catch (callError) {
                        console.error(`Error rendering attached units for call ${call.id}:`, callError);
                        // Continue with other calls even if one fails
                    }
                } else {
                    console.warn(`Container not found for call ${call.id} - DOM might not be ready yet`);
                    // Try again after a short delay for missing containers
                    setTimeout(async () => {
                        const retryContainer = document.getElementById(`attached-units-${call.id}`);
                        if (retryContainer) {
                            console.log(`Retry: Rendering attached units for call ${call.id}`);
                            try {
                                await renderAttachedUnitsForCall(call.id);
                            } catch (retryError) {
                                console.error(`Retry failed for call ${call.id}:`, retryError);
                            }
                        }
                    }, 250);
                }
            }

            // Refresh the attached units section in call details if a call is selected
            if (selectedCallId) {
                console.log(`Refreshing attached units for selected call ${selectedCallId}`);
                await renderAttachedUnits(selectedCallId);
            }
            
            console.log("Finished refreshing attached units for all calls");
        } catch (error) {
            console.error("Error handling attachedUnits updates:", error);
        } finally {
            isProcessing = false;
        }
    }

    // Expose the refresh function globally so other parts can trigger it
    window.triggerAttachedUnitsRefresh = refreshAllAttachedUnits;

    // Listen for changes in the "attachedUnit" collection
    onSnapshot(attachedUnitsRef, async (snapshot) => {
        console.log("Attached units collection changed, refreshing...");
        
        // Check if any changes are related to the selected call before playing sound
        let selectedCallAffected = false;
        if (selectedCallId && !isInitialAttachedUnitsSnapshot) {
            // Check if any of the changed documents relate to the selected call
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (data.callID === selectedCallId) {
                    selectedCallAffected = true;
                    console.log(`Attached unit change detected for selected call ${selectedCallId}: ${change.type}`);
                }
            });
        }
        
        await refreshAllAttachedUnits();
        
        // Only play sound if the selected call was affected and it's not the initial snapshot
        if (selectedCallAffected && !isInitialAttachedUnitsSnapshot) {
            playSound("callupdate");
            console.log("Attached units changed for selected call - playing callupdate sound");
        }
        
        // Mark that we've processed the initial snapshot
        if (isInitialAttachedUnitsSnapshot) {
            isInitialAttachedUnitsSnapshot = false;
        }
    });

    // Also call initial refresh to handle already existing data
    setTimeout(async () => {
        console.log("Performing initial attached units refresh...");
        await refreshAllAttachedUnits();
    }, 500); // Give more time for initial data load

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
        await logUserAction(db, 'start_dispatcher_duty', {});
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
    await logUserAction(db, 'dispatcher_logoff', {});
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
        countDisplay.style.zIndex = '1400';
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
                await logUserAction(db, 'attach_unit_button', { unitId, callId: selectedCallId });
                await attachUnit(unitId, selectedCallId);
                showNotification("Unit attached successfully.", "success");
            } else {
                await logUserAction(db, 'attach_unit_button_failed', { reason: 'No unit or call selected' });
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
                await logUserAction(db, 'detach_unit_button', { unitId, callId: selectedCallId });
                await detachUnit(unitId, selectedCallId);
                showNotification("Unit detached successfully.", "success");
            } else {
                await logUserAction(db, 'detach_unit_button_failed', { reason: 'No unit or call selected' });
                showNotification("No unit selected or no call selected.", "error");
            }
        });
    }

    // Add Call button
    const addCallBtn = document.getElementById("addCallBtn");
    if (addCallBtn) {
        addCallBtn.addEventListener("click", async () => {
            await logUserAction(db, 'open_add_call_modal', {});
            const addCallModal = document.getElementById("addCallModal");
            if (addCallModal) {
                addCallModal.style.display = "block"; // Show the modal
            }
        });

        // Close the Add Call modal when clicking the close button
        const closeModalButton = document.querySelector("#addCallModal .close");
        if (closeModalButton) {
            closeModalButton.addEventListener("click", async () => {
                await logUserAction(db, 'close_add_call_modal', {});
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
                    await logUserAction(db, 'add_call_failed', { description, location, service, callType, reason: 'Missing required fields' });
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
                    await logUserAction(db, 'add_call', { callerName, description, location, service, callType });
                    showNotification("New call added successfully.", "success");

                    const addCallModal = document.getElementById("addCallModal");
                    if (addCallModal) {
                        addCallModal.style.display = "none"; // Close the modal
                    }
                    addCallForm.reset(); // Reset the form
                    await loadCalls(); // Reload the calls list
                    // Note: Sound will be played by the real-time listener when it detects the new call
                } catch (error) {
                    await logUserAction(db, 'add_call_error', { error: error.message });
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
        
        // Set flag to prevent duplicate close sound from real-time listener
        window.isClosingCall = true;
        
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
            // --- GLOBAL DETACH LOGIC: Add all attached units to callClosingUnits before detaching ---
            for (const attachedDoc of attachedUnitSnapshot.docs) {
                const unitData = attachedDoc.data();
                const unitId = unitData.unitID;
                if (!unitId) continue;
                try {
                    // Dispatcher closing call - no closedByUnit (null indicates dispatcher)
                    await setDoc(doc(db, 'callClosingUnits', `${callId}_${unitId}`), {
                        callId,
                        unitId,
                        closedByUnit: null, // null indicates dispatcher closed the call
                        closedAt: new Date(),
                        reason: 'dispatcher_closed_call'
                    });
                    console.log(`[DISPATCH CLOSE] Created closing marker for unit ${unitId}`);
                } catch (err) {
                    console.warn(`[DISPATCH CLOSE] Failed to create closing marker for unit ${unitId}:`, err);
                }
            }
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
                
                // Log the call closure
                await logUserAction(db, 'close_call', {
                    callId,
                    detachedUnitsCount: detachedUnits.length,
                    detachedUnits: detachedUnits.map(unit => ({ unitId: unit.unitId, unitStatus: unit.unitStatus }))
                });
                
                // Step 4: Clear call details section (no rollback needed past this point)
                selectedCallId = null;
                callerName.textContent = "";
                callLocation.textContent = "";
                callStatus.textContent = "";
                callTimestamp.textContent = "";
                attachedUnits.innerHTML = "<p>No Attached Units</p>";
                await loadCalls();
                
                // Play close call sound
                playSound("callclosed");
                
                showNotification(`Call closed successfully. ${detachedUnits.length} units were detached.`, 'success');
            } catch (deleteError) {
                // Rollback: Re-attach all detached units
                await rollbackDetachedUnits(detachedUnits);
                showNotification('Failed to delete call. Operation cancelled.', 'error');
                // Reset flag on error
                window.isClosingCall = false;
            }
        } catch (error) {
            showNotification('Failed to close call. Please try again.', 'error');
            // Reset flag on error
            window.isClosingCall = false;
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
        showNotification("No call selected to save changes.", "warning");
        return;
    }

    // Get the selected call type's text (e.g., "Police Pursuit") for the status
    const callTypeText = callTypeDropdown.options[callTypeDropdown.selectedIndex]?.text || '';
    const status = `${callType}-${callTypeText}`; // Combine the code and message for the status

    try {
        console.log("DEBUG: saveCallChanges function called with:", { callId, description, callType, service, status });
        
        const callDocRef = doc(db, "calls", callId);
        await setDoc(callDocRef, { description, callType, service, status }, { merge: true }); // Update description, callType, service, and status
        playSound("newnote"); // Play save changes sound
        showNotification("Call details updated successfully.", "success");

        // Log the call detail edit
        console.log("DEBUG: About to call logUserAction for call_edit");
        await logUserAction(db, 'call_edit', {
            callId,
            description,
            callType,
            service,
            status
        });
        console.log("DEBUG: logUserAction for call_edit completed");

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
        showNotification("Failed to update call details. Please try again.", "error");
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

// Function to display notifications
function showNotification(message, type = "info") {
    // Remove any existing notification first
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Style for top-center notification
    notification.style.position = "fixed";
    notification.style.top = "32px";
    notification.style.left = "50%";
    notification.style.transform = "translateX(-50%)";
    notification.style.zIndex = "9999";
    notification.style.minWidth = "320px";
    notification.style.maxWidth = "90vw";
    notification.style.padding = "18px 32px";
    notification.style.borderRadius = "12px";
    notification.style.boxShadow = "0 4px 24px rgba(0,0,0,0.18)";
    notification.style.fontSize = "1.15rem";
    notification.style.fontWeight = "600";
    notification.style.textAlign = "center";
    notification.style.opacity = "0";
    notification.style.pointerEvents = "none";
    notification.style.transition = "opacity 0.3s, top 0.3s";
    // Color by type
    if (type === "success") {
        notification.style.background = "#2ecc40";
        notification.style.color = "#fff";
    } else if (type === "error") {
        notification.style.background = "#ff4136";
        notification.style.color = "#fff";
    } else if (type === "warning") {
        notification.style.background = "#ffdc00";
        notification.style.color = "#222";
    } else {
        notification.style.background = "#0074d9";
        notification.style.color = "#fff";
    }

    document.body.appendChild(notification);
    // Animate in
    setTimeout(() => {
        notification.style.opacity = "1";
        notification.style.top = "48px";
    }, 10);
    // Animate out and remove
    setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.top = "32px";
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Load audio paths
const audioPaths = {
    newcall: "https://s3.sonoransoftware.com/cad/default/call_open.mp3",
    callupdate: "https://s3.sonoransoftware.com/cad/default/call_edit.mp3",
    callclosed: "https://s3.sonoransoftware.com/cad/default/call_close.mp3",
    newnote: "https://s3.sonoransoftware.com/cad/default/notification1.mp3",
    tones: "https://s3.sonoransoftware.com/cad/default/signal_100.mp3",
    panictones: "https://s3.sonoransoftware.com/cad/default/tone_panic.mp3"
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
    document.getElementById('close-broadcast-composer').onclick = () => {
        logUserAction(db, 'close_broadcast_composer_modal', {});
        composer.remove();
    };

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
        if (!msg) { showNotification('Message required.', 'warning'); return; }
        await logUserAction('create_broadcast', {
            message: msg,
            priority,
            recipients: selectedRecipients.length ? selectedRecipients : ['all']
        });
        await sendBroadcast({message:msg,priority,recipients:selectedRecipients.length?selectedRecipients:['all']});
        composer.remove();
    };
    document.getElementById('save-broadcast-template-btn').onclick = () => {
        const msg = document.getElementById('broadcast-message').value.trim();
        const priority = document.getElementById('broadcast-priority').value;
        if (!msg) { showNotification('Message required.', 'warning'); return; }
        saveBroadcastTemplate({message:msg,priority,recipients:[...selectedRecipients]});
        showNotification('Template saved!', 'success');
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
        showNotification('No valid recipients found. Please check callsigns.', 'error');
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
    // Remove broadcasts older than 24 hours before adding new one
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const broadcastsRef = collection(db, 'broadcasts');
    let deletedAny = false;
    try {
        const oldBroadcasts = await getDocs(broadcastsRef);
        for (const docSnap of oldBroadcasts.docs) {
            const data = docSnap.data();
            let ts = data.timestamp;
            if (ts && ts.toDate) ts = ts.toDate().getTime();
            else if (ts instanceof Date) ts = ts.getTime();
            else if (typeof ts === 'string' || typeof ts === 'number') ts = new Date(ts).getTime();
            else ts = 0;
            if (ts < twentyFourHoursAgo) {
                await deleteDoc(doc(db, 'broadcasts', docSnap.id));
                deletedAny = true;
            }
        }
        // If all records were deleted (collection is now empty), re-add a placeholder
        const afterDelete = await getDocs(broadcastsRef);
        if (afterDelete.empty) {
            await addDoc(broadcastsRef, {
                placeholder: true,
                timestamp: new Date()
            });
        }
    } catch (e) {
        console.warn('Failed to clean up old broadcasts:', e);
    }
    await addDoc(broadcastsRef, docData);
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
        historyBtn.textContent = '📢';
        historyBtn.title = 'Show Broadcast History';
        historyBtn.style.position = 'fixed';
        historyBtn.style.bottom = '140px';
        historyBtn.style.left = '20px';
        historyBtn.style.background = '#1976d2';
        historyBtn.style.color = '#fff';
        historyBtn.style.border = 'none';
        historyBtn.style.borderRadius = '50%';
        historyBtn.style.width = '50px';
        historyBtn.style.height = '50px';
        historyBtn.style.fontSize = '18px';
        historyBtn.style.fontWeight = 'bold';
        historyBtn.style.zIndex = '1600';
        historyBtn.style.cursor = 'pointer';
        historyBtn.style.boxShadow = '0 4px 12px rgba(25, 118, 210, 0.3)';
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
    document.getElementById('close-broadcast-history-modal').onclick = ()=>{
        logUserAction('close_broadcast_history_modal', {});
        modal.remove();
    };
    // Log modal open
    logUserAction('open_broadcast_history_modal', {});
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
            tile.style.fontSize = '1em';
            tile.style.marginRight = '4px';
            tile.style.display = 'inline-block';
            tile.style.cursor = 'pointer';
            tile.title = 'Remove';
            tile.onclick = () => {
                selectedCallsigns = selectedCallsigns.filter(c => c !== cs);
                renderSelectedTiles();
            };
            listDiv.appendChild(tile);
        });
    }
    renderSelectedTiles();
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
            if (!selectedCallsigns.includes(g.value)) {
                selectedCallsigns.push(g.value);
                renderSelectedTiles();
            }
        };
        groupBtnsDiv.appendChild(btn);
    });
    // Search logic (fetch all units from Firestore for searching)
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
    // Save & Compose Message button
    document.getElementById('save-multiselect-callsigns-btn').onclick = () => {
        if (selectedCallsigns.length > 0) {
            openBroadcastComposer('private', { recipients: [...selectedCallsigns] });
            modal.remove();
        } else {
            showNotification('Select at least one callsign.', 'warning');
        }
    };
}
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
    showNotification("Session successfully ended. You can now close this tab.", 'info');

});

// Display current dispatcher session ID in the UI for debugging/cleanup
function displayDispatcherSessionId() {
    let sessionId = sessionStorage.getItem('dispatcherSessionId') || 'None';
    let el = document.getElementById('dispatcher-id-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'dispatcher-id-display';
        el.style = 'position:fixed;bottom:10px;left:10px;background:#222;color:#fff;padding:6px 12px;border-radius:6px;z-index:1300;font-size:14px;';
        document.body.appendChild(el);
    }
    el.textContent = `Dispatcher-ID: ${sessionId}`;
}

// Display user identity button (for editing Discord/IRL names)
function displayUserIdentityButton() {
    let identityBtn = document.getElementById('user-identity-btn');
    if (!identityBtn) {
        identityBtn = document.createElement('button');
        identityBtn.id = 'user-identity-btn';
        identityBtn.textContent = '👤 Edit User Details';
        identityBtn.title = 'Click to edit your Discord name and IRL name for logging';
        // Remove inline styles - positioning is now controlled by CSS
        identityBtn.addEventListener('click', showUserIdentityModal);
        document.body.appendChild(identityBtn);
    }
}

// Show user identity modal for editing Discord/IRL names
function showUserIdentityModal() {
    // Remove any existing modal
    const existingModal = document.getElementById('user-identity-modal');
    if (existingModal) existingModal.remove();

    const discordName = localStorage.getItem('discordName') || '';
    const irlName = localStorage.getItem('irlName') || '';

    const modal = document.createElement('div');
    modal.id = 'user-identity-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.5); display: flex; align-items: center;
        justify-content: center; z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; min-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h2 style="margin: 0 0 20px 0; color: #1976d2; text-align: center;">👤 User Identity</h2>
            <p style="margin: 0 0 20px 0; color: #666; text-align: center;">
                This information is used for logging your actions and will be included in all log entries.
            </p>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Discord Name:</label>
                <input type="text" id="discord-name-input" value="${discordName}" 
                       style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px;" 
                       placeholder="Your Discord username">
            </div>
            <div style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">IRL Name:</label>
                <input type="text" id="irl-name-input" value="${irlName}" 
                       style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 6px; font-size: 14px;" 
                       placeholder="Your real name">
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="save-identity-btn" 
                        style="background: #1976d2; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; cursor: pointer;">
                    💾 Save
                </button>
                <button id="cancel-identity-btn" 
                        style="background: #666; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; cursor: pointer;">
                    ❌ Cancel
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('save-identity-btn').addEventListener('click', () => {
        const newDiscordName = document.getElementById('discord-name-input').value.trim();
        const newIrlName = document.getElementById('irl-name-input').value.trim();

        if (!newDiscordName || !newIrlName) {
            alert('Please fill in both Discord name and IRL name.');
            return;
        }

        localStorage.setItem('discordName', newDiscordName);
        localStorage.setItem('irlName', newIrlName);
        
        // Log the identity update
        logUserAction(db, 'update_user_identity', {
            discordName: newDiscordName,
            irlName: newIrlName
        });

        showNotification('User identity updated successfully!', 'success');
        modal.remove();
    });

    document.getElementById('cancel-identity-btn').addEventListener('click', () => {
        modal.remove();
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

document.addEventListener('DOMContentLoaded', displayDispatcherSessionId);
document.addEventListener('DOMContentLoaded', displayUserIdentityButton);

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
