import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, getDoc, collection, addDoc, updateDoc, getDocs, setDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStatusColor, getContrastingTextColor } from "../dispatch/statusColor.js";
import { getUnitTypeColor } from '../dispatch/statusColor.js';

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

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    showNotification("Failed to initialize Firebase. Check your internet connection.", "error");
    throw e;
}

// Utility: Check network connectivity (keep for UI, not for DB ops)
function checkNetworkAndNotify() {
    const isLocal = location.hostname === "localhost" || location.protocol === "file:";
    console.log("navigator.onLine:", navigator.onLine, "isLocal:", isLocal, "location:", location.href);
    if (!isLocal && !navigator.onLine) {
        showNotification("You are offline. Please check your internet connection.", "error");
        return false;
    }
    return true;
}

// Function to display notifications
function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000); // Remove notification after 3 seconds
}

// --- Audio Playback Handling for Autoplay Restrictions ---
let userHasInteracted = false;
let soundQueue = [];
let isStartupModalActive = true;

function playSound(audioUrl) {
    if (isStartupModalActive) {
        console.log('[AUDIO] Muted due to startup modal:', audioUrl);
        return;
    }
    console.log('[AUDIO] playSound called with url:', audioUrl, 'userHasInteracted:', userHasInteracted);
    if (!audioUrl) return;
    if (!userHasInteracted) {
        soundQueue.push(audioUrl);
        return;
    }
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch((err) => {
            console.error('[AUDIO] playSound error (play promise):', err);
            // If play fails, re-queue the sound
            soundQueue.push(audioUrl);
        });
    } catch (e) {
        console.error('[AUDIO] playSound error (exception):', e);
        // Fallback: re-queue
        soundQueue.push(audioUrl);
    }
}

function flushSoundQueue() {
    if (!userHasInteracted) return;
    while (soundQueue.length > 0) {
        const url = soundQueue.shift();
        playSound(url);
    }
}

function handleUserInteraction() {
    if (!userHasInteracted) {
        userHasInteracted = true;
        flushSoundQueue();
        // Remove listeners after first interaction
        window.removeEventListener('mousedown', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
        window.removeEventListener('touchstart', handleUserInteraction);
    }
}

window.addEventListener('mousedown', handleUserInteraction);
window.addEventListener('keydown', handleUserInteraction);
window.addEventListener('touchstart', handleUserInteraction);

// --- Audio Paths Loader and PlaySound Queue ---
let audioPaths = null;
let audioPathsLoaded = false;
let pendingSoundRequests = [];

function loadAudioPaths() {
    if (audioPathsLoaded) return Promise.resolve(audioPaths);
    return fetch('../data/audio-paths.json')
        .then(res => res.json())
        .then(paths => {
            audioPaths = paths;
            audioPathsLoaded = true;
            // Play any queued sounds
            pendingSoundRequests.forEach(args => playSound(...args));
            pendingSoundRequests = [];
            return audioPaths;
        })
        .catch(() => {
            audioPathsLoaded = false;
            audioPaths = {};
        });
}

// Patch playSound to wait for audioPaths if not loaded
function playSoundByKey(key) {
    console.log('[AUDIO] playSoundByKey called with key:', key, 'audioPathsLoaded:', audioPathsLoaded, 'audioPaths:', audioPaths);
    if (!audioPathsLoaded) {
        // Queue the request until audioPaths is loaded
        pendingSoundRequests.push([audioPaths && audioPaths[key] ? audioPaths[key] : null]);
        loadAudioPaths();
        return;
    }
    const url = audioPaths && audioPaths[key] ? audioPaths[key] : null;
    playSound(url);
}

// Load audioPaths on startup
loadAudioPaths();

// Function to delete a specified unit
async function deleteUnit(unitId) {
    if (!unitId || unitId.trim() === "") {
        showNotification("No Unit ID provided. Skipping unit deletion.", "error");
        return;
    }
    try {
        const unitDoc = await getDoc(doc(db, "units", unitId));
        if (unitDoc.exists()) {
            const callsign = unitDoc.data().callsign || "Unknown";
            await deleteDoc(doc(db, "units", unitId));
            showNotification(`Deleted Unit: ID=${unitId}, Callsign=${callsign}`, "success");
        } else {
            showNotification(`Unit with ID=${unitId} does not exist.`, "warning");
        }
    } catch (error) {
        showNotification("Cannot connect to the database. Please check your network or firewall settings.", "error");
        console.error(`Error deleting unit ID=${unitId}:`, error);
    }
}

// Function to delete a specified civilian
async function deleteCivilian(civilianId) {
    if (!civilianId || civilianId.trim() === "") {
        showNotification("No Civilian ID provided. Skipping civilian deletion.", "error");
        return;
    }
    try {
        const civilianDoc = await getDoc(doc(db, "civilians", civilianId));
        if (civilianDoc.exists()) {
            const firstName = civilianDoc.data().firstName || "Unknown";
            await deleteDoc(doc(db, "civilians", civilianId));
            showNotification(`Deleted Civilian: ID=${civilianId}, First Name=${firstName}`, "success");
        } else {
            showNotification(`Civilian with ID=${civilianId} does not exist.`, "warning");
        }
    } catch (error) {
        showNotification("Cannot connect to the database. Please check your network or firewall settings.", "error");
        console.error(`Error deleting civilian ID=${civilianId}:`, error);
    }
}

// Function to remove unit and character from database and return a message
async function removeUnitandCharacter() {
    // Get displayed IDs from the page
    const civilianIdElement = document.getElementById("civilian-id-display");
    const unitIdElement = document.getElementById("unit-id-display");
    if (!civilianIdElement || !unitIdElement) {
        return "Could not find ID display elements.";
    }
    const civilianId = civilianIdElement.textContent.replace("Current CivilianID: ", "").trim();
    const unitId = unitIdElement.textContent.replace("Current UnitID: ", "").trim();

    let alertMessage = "";

    // Remove civilian from civilians collection
    if (civilianId && civilianId !== "None") {
        try {
            await deleteDoc(doc(db, "civilians", civilianId));
            alertMessage += `Deleted Civilian: ID=${civilianId}\n`;
        } catch (error) {
            alertMessage += `Error deleting Civilian: ID=${civilianId}\n`;
        }
    }

    // Remove unit from units collection
    if (unitId && unitId !== "None") {
        try {
            await deleteDoc(doc(db, "units", unitId));
            alertMessage += `Deleted Unit: ID=${unitId}\n`;
        } catch (error) {
            alertMessage += `Error deleting Unit: ID=${unitId}\n`;
        }
    }

    // Remove from availableUnits where field "unitId" matches displayed unitId
    try {
        const availableUnitsSnap = await getDocs(collection(db, "availableUnits"));
        let removedAvailable = 0;
        for (const docSnap of availableUnitsSnap.docs) {
            const data = docSnap.data();
            if (data.unitId === unitId) {
                await deleteDoc(doc(db, "availableUnits", docSnap.id));
                removedAvailable++;
            }
        }
        if (removedAvailable > 0) {
            alertMessage += `Removed ${removedAvailable} availableUnit(s) with unitId=${unitId}\n`;
        }
    } catch (error) {
        alertMessage += `Error cleaning availableUnits for unitId=${unitId}\n`;
    }

    // Remove from attachedUnit where field "unitID" matches displayed unitId
    try {
        const attachedUnitsSnap = await getDocs(collection(db, "attachedUnit"));
        let removedAttached = 0;
        for (const docSnap of attachedUnitsSnap.docs) {
            const data = docSnap.data();
            if (data.unitID === unitId) {
                await deleteDoc(doc(db, "attachedUnit", docSnap.id));
                removedAttached++;
            }
        }
        if (removedAttached > 0) {
            alertMessage += `Removed ${removedAttached} attachedUnit(s) with unitID=${unitId}\n`;
        }
    } catch (error) {
        alertMessage += `Error cleaning attachedUnit for unitID=${unitId}\n`;
    }

    return alertMessage || "No valid IDs to delete.";
}

// Function to handle "Back To Home" button click
async function handleBackToHome() {
    const alertMessage = await removeUnitandCharacter();
    showNotification(alertMessage, "info");
    window.location.href = "../index.html";
}

// Handle page unload with confirmation and remove civilian and unit
window.addEventListener("beforeunload", (event) => {
    console.log("beforeunload event triggered"); // Debugging log to confirm the event is firing
    removeUnitandCharacter(); // Call without await (browser will not wait for async)
    event.returnValue = ""; // Required for some browsers to show the confirmation dialog
});

// Function to populate character slots dynamically
function populateCharacterSlots() {
    const slotSelect = document.getElementById("slot-select");
    if (!slotSelect) return;

    slotSelect.innerHTML = ""; // Clear existing options

    // Load characters from localStorage
    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "--Select--";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    slotSelect.appendChild(defaultOption);

    // Loop through the two character slots (slot0, slot1)
    for (let i = 0; i < 2; i++) {
        const key = `slot${i}`;
        const characterData = globalCharacters[key];
        const option = document.createElement("option");
        option.value = key;
        if (characterData) {
            option.textContent = `Character ${i + 1}: ${characterData.firstName || "Unknown"} ${characterData.lastName || ""}`;
        } else {
            option.textContent = `Character ${i + 1} (Empty)`;
        }
        slotSelect.appendChild(option);
    }
}

// Function to load a character from the selected slot
function loadCharacterFromSlot() {
    const slotSelect = document.getElementById("slot-select");
    const selectedSlot = slotSelect.value;

    if (!selectedSlot) {
        showNotification("Please select a slot.", "error");
        return;
    }

    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const characterData = globalCharacters[selectedSlot];

    if (characterData) {
        document.getElementById("first-name").value = characterData.firstName || "";
        document.getElementById("last-name").value = characterData.lastName || "";
        document.getElementById("dob").value = characterData.dob || "";
        document.getElementById("phone").value = characterData.phone || "";
        document.getElementById("address").value = characterData.address || "";
        document.getElementById("profile-picture").src = characterData.profilePicture || "../imgs/blank-profile-picture-973460.svg";

        // Calculate and populate the age field
        const dobInput = document.getElementById("dob");
        const ageInput = document.getElementById("age");
        if (dobInput && ageInput && characterData.dob) {
            const age = calculateAge(characterData.dob);
            ageInput.value = age >= 0 ? age : "";
        }
    } else {
        showNotification("No character data found for the selected slot.", "error");
    }
}

// Function to calculate age from date of birth
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Function to save details to the database
async function saveDetails() {
    const callsignInput = document.getElementById("callsign-input").value.trim();
    const specificType = document.getElementById("specific-type").value.trim();
    const firstName = document.getElementById("first-name").value.trim();
    const lastName = document.getElementById("last-name").value.trim();
    const dob = document.getElementById("dob").value;
    const phone = document.getElementById("phone").value.trim();
    const profilePicture = document.getElementById("profile-picture").src;
    const address = document.getElementById("address").value.trim();

    if (!callsignInput || !specificType) {
        showNotification("Please enter a callsign and specific type.", "error");
        return;
    }

    if (!firstName || !lastName) {
        showNotification("Please load a character before saving details.", "error");
        return;
    }

    try {
        // Add the unit to the "units" collection
        const unitDocRef = await addDoc(collection(db, "units"), {
            callsign: callsignInput,
            specificType,
            status: "Unavailable",
            unitType: "Ambulance",
            timestamp: new Date()
        });

        // Add the civilian to the "civilians" collection
        const civilianDocRef = await addDoc(collection(db, "civilians"), {
            firstName,
            lastName,
            dob,
            phone,
            profilePicture,
            address,
            timestamp: new Date()
        });

        // Save IDs to sessionStorage
        sessionStorage.setItem("unitId", unitDocRef.id);
        sessionStorage.setItem("civilianId", civilianDocRef.id);

        // Update the displayed IDs
        displayCurrentIDs();

        // hide the background fade
        document.querySelector('.modal-overlay').style.display = 'none';

        // Display the saved callsign on the main page
        const callsignDisplay = document.getElementById("callsign-display");
        callsignDisplay.textContent = callsignInput;

        showNotification("Details saved successfully!", "success");
        // Close the modal after saving details
        closeSetupModal();
        document.body.classList.remove('modal-active'); // Ensure overlay is removed
    } catch (error) {
        showNotification("Cannot connect to the database. Please check your network or firewall settings.", "error");
        console.error("Error saving details:", error);
    }
}

// Function to display current IDs
function displayCurrentIDs() {
    const civilianId = sessionStorage.getItem("civilianId") || "None";
    const unitId = sessionStorage.getItem("unitId") || "None";

    document.getElementById("civilian-id-display").textContent = `Current CivilianID: ${civilianId}`;
    document.getElementById("unit-id-display").textContent = `Current UnitID: ${unitId}`;
}

// Function to handle status button clicks
async function handleStatusChange(status) {
    console.log('[DEBUG] handleStatusChange called with status:', status);
    const unitId = sessionStorage.getItem("unitId");
    if (!unitId || unitId === "None") {
        showNotification("No valid UnitID found. Cannot change status.", "error");
        return;
    }
    try {
        // Update the unit's status in the database
        const unitRef = doc(db, "units", unitId);
        await getDoc(unitRef); // Ensure the unit exists
        await updateDoc(unitRef, { status });        // Show a notification
        showNotification(`Status changed to: ${status}`, "success");
        // Update the button styles
        document.querySelectorAll(".status-buttons button").forEach((button) => {
            button.classList.remove("selected-status");
        });
        const selectedButton = document.querySelector(`button[data-status="${status}"]`);
        if (selectedButton) {
            selectedButton.classList.add("selected-status");
        }
        // Update the status indicator (this will play the sound)
        updateStatusIndicator(status);
    } catch (error) {
        showNotification("Cannot connect to the database. Please check your network or firewall settings.", "error");
        console.error(`Error updating status to ${status}:`, error);
    }
}

// --- Modal logic for Hospital ---
function showHospitalModal(onConfirm, onCancel) {
    const modal = document.getElementById("hospital-modal");
    const select = document.getElementById("hospital-select");
    const transportTypeSelect = document.getElementById("transport-type-select");

    // Populate hospital dropdown
    loadHospitalLocations().then(locations => {
        select.innerHTML = '<option value="" disabled selected>--Select Hospital--</option>';
        locations.forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
    });

    // Set default for transport type
    if (transportTypeSelect) {
        transportTypeSelect.value = "Transport";
        transportTypeSelect.style.display = ""; // Always show for hospital modal
        transportTypeSelect.previousElementSibling.style.display = ""; // Show label
    }

    modal.style.display = "block";
    document.body.classList.add('modal-active');

    const confirmBtn = document.getElementById("confirm-hospital-btn");
    const cancelBtn = document.getElementById("cancel-hospital-btn");

    function cleanup() {
        modal.style.display = "none";
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
    }

    function confirmHandler() {
        const location = select.value;
        const transportType = transportTypeSelect.value;
        if (!location) {
            showNotification("Please select a hospital location.", "error");
            return;
        }
        cleanup();
        onConfirm(location, transportType);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
}

// --- Modal logic for Base ---
function loadBaseLocations() {
    // Returns a Promise that resolves to the base locations array
    return fetch("../data/location.json")
        .then(res => res.json())
        .then(data => data.base || [])
        .catch(() => []);
}

function showBaseModal(onConfirm, onCancel) {
    const modal = document.getElementById("base-modal");
    const select = document.getElementById("base-select");
    const baseTypeSelect = document.getElementById("base-type-select");

    // Populate base dropdown
    loadBaseLocations().then(locations => {
        select.innerHTML = '<option value="" disabled selected>--Select Base--</option>';
        locations.forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
    });

    modal.style.display = "block";
    document.body.classList.add('modal-active');

    const confirmBtn = document.getElementById("confirm-base-btn");
    const cancelBtn = document.getElementById("cancel-base-btn");

    function cleanup() {
        modal.style.display = "none";
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
    }

    function confirmHandler() {
        const location = select.value;
        const baseType = baseTypeSelect.value;
        if (!location) {
            showNotification("Please select a base location.", "error");
            return;
        }
        cleanup();
        onConfirm(location, baseType);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
}

// --- Modal logic for Standby ---
function loadStandbyLocations() {
    // Returns a Promise that resolves to the standby locations array
    return fetch("../data/location.json")
        .then(res => res.json())
        .then(data => data.standby || [])
        .catch(() => []);
}

function showStandbyModal(onConfirm, onCancel) {
    const modal = document.getElementById("standby-modal");
    const select = document.getElementById("standby-select");

    // Populate standby dropdown
    loadStandbyLocations().then(locations => {
        select.innerHTML = '<option value="" disabled selected>--Select Standby--</option>';
        locations.forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
    });

    // Show the modal (ensure both display and .active for compatibility)
    modal.style.display = "block";
    modal.classList.add("active");
    document.body.classList.add('modal-active');

    const confirmBtn = document.getElementById("confirm-standby-btn");
    const cancelBtn = document.getElementById("cancel-standby-btn");

    function cleanup() {
        modal.style.display = "none";
        modal.classList.remove("active");
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
    }

    function confirmHandler() {
        const location = select.value;
        if (!location) {
            showNotification("Please select a standby location.", "error");
            return;
        }
        cleanup();
        onConfirm(location);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
}

// --- Modal logic for Refuel Location ---
function loadFuelLocations() {
    // Returns a Promise that resolves to the fuel station locations array
    return fetch("../data/location.json")
        .then(res => res.json())
        .then(data => data["fuel-stations"] || [])
        .catch(() => []);
}

function showRefuelModal(onConfirm, onCancel) {
    const modal = document.getElementById("refuel-modal");
    const select = document.getElementById("refuel-location-select");

    // Populate fuel station dropdown
    loadFuelLocations().then(locations => {
        select.innerHTML = '<option value="" disabled selected>--Select Fuel Station--</option>';
        locations.forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
    });

    modal.style.display = "block";
    modal.classList.add("active");
    document.body.classList.add('modal-active');

    const confirmBtn = document.getElementById("confirm-refuel-btn");
    const cancelBtn = document.getElementById("cancel-refuel-btn");

    function cleanup() {
        modal.style.display = "none";
        modal.classList.remove("active");
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
    }

    function confirmHandler() {
        const location = select.value;
        if (!location) {
            showNotification("Please select a fuel station.", "error");
            return;
        }
        cleanup();
        onConfirm(location);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
}

// --- Modal logic for Refuel Price ---
function showRefuelPriceModal(onConfirm) {
    const modal = document.getElementById("refuel-price-modal");
    const priceInput = document.getElementById("refuel-price-input");
    priceInput.value = ""; // Reset
    modal.style.display = "block";
    modal.classList.add("active");
    document.body.classList.add('modal-active');

    // Prevent closing by clicking outside
    function preventClose(e) {
        // Only prevent if click is outside the modal-content
        if (!modal.contains(e.target)) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
    document.addEventListener("mousedown", preventClose, true);

    const confirmBtn = document.getElementById("confirm-refuel-price-btn");

    function cleanup() {
        modal.style.display = "none";
        modal.classList.remove("active");
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        document.removeEventListener("mousedown", preventClose, true);
    }

    async function confirmHandler(e) {
        e.preventDefault();
        const price = priceInput.value.trim();
        if (!/^£?\d+(\.\d{2})?$/.test(price)) {
            showNotification("Please enter a valid price in format £xxx.xx", "error");
            return;
        }

        try {
            const civilianId = sessionStorage.getItem("civilianId");
            const unitId = sessionStorage.getItem("unitId");
            let civilianName = "Unknown";
            let unitCallsign = "Unknown";

            if (civilianId) {
                const civDoc = await getDoc(doc(db, "civilians", civilianId));
                if (civDoc.exists()) {
                    const data = civDoc.data();
                    civilianName = (data.firstName || "") + " " + (data.lastName || "");
                }
            }
            if (unitId) {
                const unitDoc = await getDoc(doc(db, "units", unitId));
                if (unitDoc.exists()) {
                    unitCallsign = unitDoc.data().callsign || "Unknown";
                }
            }

            // --- Delete refuelLogs older than 1 week ---
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const refuelLogsSnap = await getDocs(collection(db, "refuelLogs"));
            for (const docSnap of refuelLogsSnap.docs) {
                const data = docSnap.data();
                if (data.timestamp && data.timestamp.toDate) {
                    // Firestore Timestamp object
                    if (data.timestamp.toDate() < oneWeekAgo) {
                        await deleteDoc(doc(db, "refuelLogs", docSnap.id));
                    }
                } else if (data.timestamp instanceof Date) {
                    // JS Date object
                    if (data.timestamp < oneWeekAgo) {
                        await deleteDoc(doc(db, "refuelLogs", docSnap.id));
                    }
                } else if (typeof data.timestamp === "string" || typeof data.timestamp === "number") {
                    // Try to parse string/number
                    const ts = new Date(data.timestamp);
                    if (ts < oneWeekAgo) {
                        await deleteDoc(doc(db, "refuelLogs", docSnap.id));
                    }
                }
            }

            await addDoc(collection(db, "refuelLogs"), {
                CivianName: civilianName,
                "unit-callsign": unitCallsign,
                Price: price.startsWith("£") ? price : "£" + price,
                timestamp: new Date()
            });            // --- Set status to Available after logging ---
            if (unitId) {
                await updateDoc(doc(db, "units", unitId), { status: "Available" });
                document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                const availableBtn = document.querySelector('button[data-status="Available"]');
                if (availableBtn) availableBtn.classList.add("selected-status");
                
                // Update the status indicator at the top
                updateStatusIndicator("Available");
                
                // Play status change sound
                playSoundByKey('statuschange');
                
                showNotification("Status changed to: Available", "success");
            }
        } catch (err) {
            showNotification("Failed to log refuel in database.", "error");
        }

        cleanup();
        if (typeof onConfirm === "function") {
            onConfirm(price.startsWith("£") ? price : "£" + price);
        }
    }

    confirmBtn.addEventListener("click", confirmHandler);
    // Also allow pressing Enter in the input to trigger save
    priceInput.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") {
            confirmHandler(ev);
        }
    });
}

// Utility to open/close modal and overlay, and prevent background interaction
function openSetupModal() {
    document.getElementById('setup-modal').classList.add('active');
    document.getElementById('modal-overlay').classList.add('active');
    document.body.classList.add('modal-active');
}

function closeSetupModal() {
    document.getElementById('setup-modal').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.classList.remove('modal-active');
    isStartupModalActive = false;
    flushSoundQueue(); // Play any queued sounds after modal closes
}

// Clean up any orphaned unit/civilian on page load
window.addEventListener('load', async () => {
    checkNetworkAndNotify();
    // Use removeUnitandCharacter to remove any leftover unit/civilian from previous session
    await removeUnitandCharacter();

    // Modal setup
    populateCharacterSlots();
    openSetupModal();
    document.getElementById('modal-overlay').addEventListener('click', closeSetupModal);
    const modalBackBtn = document.getElementById('modal-back-home');
    if (modalBackBtn) modalBackBtn.addEventListener('click', handleBackToHome);
    const headerBackBtn = document.querySelector('.header .back-button');
    if (headerBackBtn) headerBackBtn.addEventListener('click', handleBackToHome);
});

// Add this function before showHospitalModal to fix the error
function loadHospitalLocations() {
    // Returns a Promise that resolves to the hospital locations array
    return fetch("../data/location.json")
        .then(res => res.json())
        .then(data => data.hospital || [])
        .catch(() => []);
}

// Utility to update the status gradient bar color
function updateStatusGradientBar(status, animate = true) {
    const bar = document.getElementById("status-gradient-bar");
    if (!bar) return;
    const color = getStatusColor(status);
    bar.style.background = `linear-gradient(
        to bottom,
        ${color} 0%,
        ${color}CC 25%,
        ${color}88 60%,
        transparent 100%
    )`;
    bar.style.opacity = "1";
    if (animate) animateStatusGradientBar(status);
}

// Utility to animate the status gradient bar
function animateStatusGradientBar(status) {
    const bar = document.getElementById("status-gradient-bar");
    if (!bar) return;
    const color = getStatusColor(status);

    // Set the gradient background (multi-stop for smoothness)
    bar.style.background = `linear-gradient(
        to bottom,
        ${color} 0%,
        ${color}CC 25%,
        ${color}88 60%,
        transparent 100%
    )`;

    // Remove previous animation if any
    bar.classList.remove("flashing");
    // Force reflow to restart animation
    void bar.offsetWidth;
    bar.classList.add("flashing");

    // Remove the class after animation completes (0.25s * 2 = 0.5s)
    setTimeout(() => {
        bar.classList.remove("flashing");
    }, 500);
}

// Utility to update the status indicator bar in the header
function updateStatusIndicator(status) {
    const indicator = document.getElementById("current-status-indicator");
    if (!indicator) return;
    const color = getStatusColor(status);
    indicator.textContent = status;
    indicator.style.background = color;
    indicator.style.color = getContrastingTextColor(color);
    playSoundByKey('statuschange'); // Play sound on status change
}

// --- Dispatcher Counter and Calls List Logic ---
let dispatcherActive = false;
let previousCallsMap = new Map(); // Track previous calls by id for update detection

// Listen for dispatcher count changes (single listener only)
const dispatchersRef = collection(db, 'dispatchers');
onSnapshot(dispatchersRef, (snapshot) => {
    let count = snapshot ? snapshot.size : 0;
    if (count > 0) count = count - 1;
    dispatcherActive = count >= 1;
    updateDispatcherCount(snapshot);
}, (error) => {
    dispatcherActive = false;
    updateDispatcherCount(null);
});

// Listen for calls changes (Ambulance & Multiple)
const callsRef = collection(db, 'calls');
const q = query(callsRef, where('service', 'in', ['Ambulance', 'Multiple']));
onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // --- Play sound for new call if dispatcher is NOT active ---
    const newCalls = calls.filter(call => !previousCallsMap.has(call.id));
    if (newCalls.length > 0 && !dispatcherActive) {
        // Only play for truly new calls
        console.log('[AUDIO] New call sound should play (newambulancecall)');
        playSoundByKey('newambulancecall');
    }
    // --- Play sound for updated call info (not new) ---
    let playedUpdate = false;
    for (const call of calls) {
        if (previousCallsMap.has(call.id)) {
            const prev = previousCallsMap.get(call.id);
            // Compare fields that indicate an update (description, status, location, etc)
            if ((call.description !== prev.description || call.status !== prev.status || call.location !== prev.location) && !playedUpdate) {
                console.log('[AUDIO] Call update sound should play (newnote)');
                playSoundByKey('newnote');
                playedUpdate = true; // Only play once per batch
            }
        }
    }
    // Update previousCallsMap for next snapshot
    previousCallsMap.clear();
    for (const call of calls) previousCallsMap.set(call.id, { ...call });
    displayCalls(calls);
}, (error) => {
    const callsContainer = document.getElementById('calls-container');
    if (callsContainer) {
        callsContainer.innerHTML = '<p style="color: red;">Error loading calls. Please try again later.</p>';
    }
});

// Utility: Debug log all attachedUnit docs for a call
async function debugLogAttachedUnitsForCall(callId) {
    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("callID", "==", callId)
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);
        if (attachedUnitSnapshot.empty) {
            console.warn(`[DEBUG] [ALL attachedUnit docs for call ${callId}] None found.`);
            return;
        }
        for (const docSnap of attachedUnitSnapshot.docs) {
            const data = docSnap.data();
            const unitID = data.unitID;
            if (!unitID) {
                console.warn(`[DEBUG] [attachedUnit] Missing unitID in doc`, docSnap.id, data);
                continue;
            }
            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);
            if (!unitSnap.exists()) {
                console.warn(`[DEBUG] [attachedUnit] unitID ${unitID} does not exist in units collection.`);
            } else {
                console.log(`[DEBUG] [attachedUnit] unitID ${unitID} found. Unit data:`, unitSnap.data());
            }
        }
    } catch (err) {
        console.error(`[DEBUG] Error in debugLogAttachedUnitsForCall for callId ${callId}:`, err);
    }
}

async function renderAttachedUnitsForCallCompact(callId, container) {
    if (!container) return;

    // Prevent multiple simultaneous renders for the same container
    if (container.dataset.rendering === 'true') {
        return;
    }
    container.dataset.rendering = 'true';

    container.innerHTML = ''; // Clear existing content    
    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnits"),
            where("callID", "==", callId)
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        if (attachedUnitSnapshot.empty) {
            container.innerHTML = '<div style="color: #999; font-size: 9px; text-align: center; padding: 6px; font-style: italic;">None</div>';
            container.dataset.rendering = 'false';
            return;
        }

        const renderedUnitIds = new Set();
        const unitCards = [];

        for (const docSnap of attachedUnitSnapshot.docs) {
            const { unitID } = docSnap.data();

            if (!unitID || renderedUnitIds.has(unitID)) {
                continue;
            }

            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);

            if (!unitSnap.exists()) {
                console.warn(`Unit with ID ${unitID} not found in units collection.`);
                continue;
            }

            const unitData = unitSnap.data();
            const unitService = unitData.service || 'Unknown';
            const unitStatus = unitData.status || 'Unknown';
            const unitCallsign = unitData.callsign || 'N/A';
            const unitType = unitData.unitType || 'Unknown';
            const specificType = unitData.specificType || 'Unknown';

            // Get colors for the unit - use status color for background
            const statusColor = getStatusColor(unitStatus);
            const textColor = getContrastingTextColor(statusColor);

            // Create unit card HTML with callsign and service-specificType format
            // Build tooltip with only non-"Unknown" values
            const tooltipParts = [];
            if (unitCallsign && unitCallsign !== 'N/A') tooltipParts.push(unitCallsign);
            if (unitType && unitType !== 'Unknown') tooltipParts.push(unitType);
            if (specificType && specificType !== 'Unknown') tooltipParts.push(`(${specificType})`);
            if (unitService && unitService !== 'Unknown') tooltipParts.push(unitService);
            if (unitStatus && unitStatus !== 'Unknown') tooltipParts.push(unitStatus);
            const tooltip = tooltipParts.join(' ');

            const unitCardHTML = `
                <div class="unit-card" style="background-color: ${statusColor}; color: ${textColor};" title="${tooltip}">
                    <div class="unit-callsign">${unitCallsign}</div>
                    <div class="unit-service-type">${unitType}-${specificType}</div>
                </div>
            `;

            unitCards.push(unitCardHTML);
            renderedUnitIds.add(unitID);
        }

        if (unitCards.length === 0) {
            container.innerHTML = '<div style="color: #999; font-size: 9px; text-align: center; padding: 6px; font-style: italic;">None</div>';
        } else {
            container.innerHTML = unitCards.join('');
        }
    } catch (error) {
        console.error(`Error fetching attached units for call ID ${callId}:`, error);
        container.innerHTML = '<div style="color: #f44; font-size: 9px; text-align: center; padding: 6px; font-style: italic;">Error</div>';
    } finally {
        container.dataset.rendering = 'false';
    }
}

// Function to render attached units for the selected call in the call details section
async function renderAttachedUnitsForSelectedCall(callId, container) {
    if (!container) return;

    // Prevent multiple simultaneous renders for the same container
    if (container.dataset.rendering === 'true') {
        return;
    }
    container.dataset.rendering = 'true';

    container.innerHTML = ''; // Clear existing content

    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnits"),
            where("callID", "==", callId) // Fetch units attached to the specific call
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);

        if (attachedUnitSnapshot.empty) {
            container.innerHTML = '<p style="color: #ccc; font-style: italic; text-align: center; padding: 15px; margin: 0; background-color: rgba(255,255,255,0.05); border-radius: 8px; width: 100%;">No Attached Units</p>';
            container.dataset.rendering = 'false';
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
            unitDiv.classList.add('attached-unit-detail');
            unitDiv.style.backgroundColor = getStatusColor(unitData.status);
            unitDiv.style.color = getContrastingTextColor(getStatusColor(unitData.status));
            unitDiv.style.padding = '8px 12px';
            unitDiv.style.margin = '5px 0';
            unitDiv.style.borderRadius = '8px';
            unitDiv.style.fontSize = '14px';
            unitDiv.style.fontWeight = 'bold';
            unitDiv.style.display = 'flex';
            unitDiv.style.justifyContent = 'space-between';
            unitDiv.style.alignItems = 'center';
            unitDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            unitDiv.style.width = '100%';

            unitDiv.innerHTML = `
            <div style="width: 100%; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 16px; font-weight: bold;">${unitData.unitType || 'Unknown'}</span>
                    <span style="font-size: 16px; opacity: 0.9;">${unitData.specificType || 'Unknown'}</span>
                </div>
                <div style="text-align: right; font-size: 16px; font-weight: bold; margin-left: 20px;">
                    ${unitData.callsign || 'N/A'}
                </div>
            </div>
            `;

            container.appendChild(unitDiv);
            renderedUnitIds.add(unitID); // Mark this unit as rendered
        }

        if (renderedUnitIds.size === 0) {
            container.innerHTML = '<p style="color: #ccc; font-style: italic; text-align: center; padding: 10px;">No Attached Units</p>';
        }
    } catch (error) {
        console.error(`Error fetching attached units for selected call ID ${callId}:`, error);
        container.innerHTML = '<p style="color: #ff6b6b; font-style: italic; text-align: center; padding: 15px; margin: 0; background-color: rgba(255,107,107,0.1); border-radius: 8px; border: 1px solid rgba(255,107,107,0.3);">Error loading attached units.</p>';
    } finally {
        container.dataset.rendering = 'false';
    }
}

// Function to display calls in the ambulance interface
async function displayCalls(calls) {
    console.log('[DEBUG] displayCalls called with', calls.length, 'calls');
    
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) {
        console.error('Calls container not found');
        return;
    }

    callsContainer.innerHTML = ''; // Clear existing calls

    if (calls.length === 0) {
        callsContainer.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
        return;
    }    // Sort calls by timestamp (newest first)
    calls.sort((a, b) => {
        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return dateB - dateA; // Newest first
    });

    calls.forEach((call) => {
        const callCard = document.createElement('div');
        callCard.classList.add('call-card');
        callCard.dataset.callId = call.id;        const serviceColor = getUnitTypeColor(call.service);
        
        // Get first 3 letters of service for display
        const serviceAbbrev = (call.service || 'SVC').substring(0, 3).toUpperCase();
        
        // Format the timestamp for compact display (time on one line, date on another)
        let formattedTimestamp = 'Unknown';
        if (call.timestamp) {
            const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            const timeStr = timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const dateStr = timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
            formattedTimestamp = `${timeStr}<br>${dateStr}`;
        }        callCard.innerHTML = `
            <div class="call-info">
                <div class="call-service-section" style="background-color: ${serviceColor};" 
                     title="Service: ${call.service || 'Service not provided'}">
                    ${serviceAbbrev}
                </div>
                <div class="call-status-section">
                    <div class="call-status" title="Call Type: ${call.status || 'Awaiting Dispatch'}">${call.status || 'Awaiting Dispatch'}</div>
                    <div class="caller-name" title="Caller: ${call.callerName || 'Unknown'}">${call.callerName || 'Unknown'}</div>
                    <div class="call-location" title="Location: ${call.location || 'Location not provided'}">${call.location || 'Location not provided'}</div>
                </div>
            </div>
            <div class="call-end-section">
                <div class="attached-units-section">
                    <div class="attached-units-compact" id="attached-units-${call.id}">
                        <!-- Placeholder for attached units -->
                    </div>
                </div>
                <div class="call-timestamp" title="Call Time: ${call.timestamp ? (call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp)).toLocaleString('en-GB') : 'Unknown'}">${formattedTimestamp}</div>
            </div>
        `;

        // Attach click event listener to select the call
        callCard.addEventListener('click', () => selectCall(call));

        callsContainer.appendChild(callCard);

        // Render attached units for this call using the compact version (async operation)
        const attachedUnitsContainer = document.getElementById(`attached-units-${call.id}`);
        if (attachedUnitsContainer) {
            renderAttachedUnitsForCallCompact(call.id, attachedUnitsContainer).catch(error => {
                console.error(`Error rendering attached units for call ${call.id}:`, error);
            });
        }
    });

    console.log('[DEBUG] displayCalls completed, rendered', calls.length, 'call cards');
}

// Function to select a call and update the call details panel
async function selectCall(call) {
    try {
        // Always fetch the latest call data from Firestore
        const callDoc = await getDoc(doc(db, "calls", call.id));
        const latestCall = callDoc.exists() ? { id: callDoc.id, ...callDoc.data() } : call;

        // Update call details in the UI
        const callerNameElement = document.querySelector('.callerName');
        const descriptionElement = document.querySelector('.descriptionText');
        const locationElement = document.querySelector('.location');
        const incidentElement = document.querySelector('.incident');
        const timestampElement = document.querySelector('.timestamp');

        if (callerNameElement) {
            callerNameElement.textContent = latestCall.callerName || 'Unknown';
        }
        if (descriptionElement) {
            descriptionElement.textContent = latestCall.description || 'No description provided';
        }
        if (locationElement) {
            locationElement.textContent = latestCall.location || 'Location not provided';
        }
        if (incidentElement) {
            incidentElement.textContent = latestCall.status || 'Unknown';
        }
        if (timestampElement && latestCall.timestamp) {
            const timestamp = latestCall.timestamp.toDate ? latestCall.timestamp.toDate() : new Date(latestCall.timestamp);
            timestampElement.textContent = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
        }
        
        // Store selected call data for potential self-attach functionality
        window.selectedCall = latestCall;
        
        // Set up real-time listener for the selected call
        if (window.setupSelectedCallListener) {
            window.setupSelectedCallListener(latestCall.id);
        }
        
        // Render attached units for the selected call in call details section
        const attachedUnitsContainer = document.getElementById('attached-units-container');
        if (attachedUnitsContainer) {
            await renderAttachedUnitsForSelectedCall(latestCall.id, attachedUnitsContainer).catch(e => console.error('Error rendering attached units for selected call', latestCall.id, e));
        } else {
            console.error('No attached-units-container found for selected call', latestCall.id);
        }
        
        // Visual feedback - highlight selected call
        document.querySelectorAll('.call-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Find and highlight the clicked call card
        const selectedCard = document.querySelector(`[data-call-id="${latestCall.id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        // Dispatch custom event to notify that call details have changed
        document.dispatchEvent(new CustomEvent('callDetailsChanged'));
        
    } catch (error) {
        console.error('Error selecting call:', error);
        showNotification('Error selecting call', 'error');
    }
}

// Smart dispatcher state management - track previous state to only clear UI on capability transitions
let previousDispatcherState = null; // null = unknown, true = self-dispatch capable, false = not self-dispatch capable

// Real-time update with initial load
const dispatchersRef2 = collection(db, 'dispatchers');
onSnapshot(dispatchersRef2, (snapshot) => {
    console.log('Dispatcher snapshot updated, count:', snapshot.size); // Debug log
    updateDispatcherCount(snapshot);
}, (error) => {
    console.error('Error with dispatcher listener:', error);
    const counterDiv = document.getElementById('dispatcher-counter-display');
    if (counterDiv) counterDiv.textContent = 'Active Dispatchers: ?';
});

// Initial population of calls and setup real-time listener
try {
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('service', 'in', ['Ambulance', 'Multiple']));

    // Set up real-time listener for calls (this will also handle initial load)
    onSnapshot(q, (snapshot) => {
        console.log('Calls snapshot received:', snapshot.docs.map(doc => doc.data()));

        const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (calls.length === 0) {
            console.warn('No calls available in snapshot.');
        }

        displayCalls(calls);
    }, (error) => {
        console.error('Error with calls listener:', error);
        const callsContainer = document.getElementById('calls-container');
        if (callsContainer) {
            callsContainer.innerHTML = '<p style="color: red;">Error loading calls. Please try again later.</p>';
        }
    });
} catch (error) {
    console.error('Error setting up calls listener:', error);
}

// Add real-time listeners for attached units updates
document.addEventListener("DOMContentLoaded", () => {
    console.log('Initializing real-time listeners for attached units and unit status updates');    // Listen for changes in the "attachedUnit" collection (singular)
    const attachedUnitRef = collection(db, "attachedUnit");
    onSnapshot(attachedUnitRef, async (snapshot) => {
        try {
            console.log('AttachedUnit collection updated, refreshing attached units display');
            
            // Check if current user's unit is involved in any changes for sound logic
            const currentUnitId = sessionStorage.getItem('unitId');
            let currentUserInvolved = false;
            
            if (currentUnitId && snapshot.docChanges) {
                snapshot.docChanges().forEach(change => {
                    const data = change.doc.data();
                    if (data.unitID === currentUnitId) {
                        currentUserInvolved = true;
                        // Only play sound if this is not the user's own action (they already heard it)
                        if (change.type === 'added' || change.type === 'removed') {
                            // Don't play sound here - it's handled by the Self Attach button
                        }
                    }
                });
            }

            // Refresh attached units for all calls in the calls list
            const callsContainer = document.getElementById('calls-container');
            if (!callsContainer) return;

            const callCards = callsContainer.querySelectorAll('.call-card');
            for (const callCard of callCards) {
                const callId = callCard.dataset.callId;
                const attachedUnitsContainer = callCard.querySelector('.attached-units-compact');
                if (callId && attachedUnitsContainer) {
                    await renderAttachedUnitsForCallCompact(callId, attachedUnitsContainer);
                }
            }

            // Also refresh the selected call's attached units if one is selected
            if (window.selectedCall) {
                const attachedUnitsDetailsContainer = document.getElementById('attached-units-container');
                if (attachedUnitsDetailsContainer) {
                    await renderAttachedUnitsForSelectedCall(window.selectedCall.id, attachedUnitsDetailsContainer);
                }
            }
        } catch (error) {
            console.error("Error handling attachedUnit updates:", error);
        }
    }, (error) => {
        console.error("Error listening for attachedUnit updates:", error);
    });

    // Listen for changes in the "units" collection to update unit status in real-time
    const unitsRef = collection(db, "units");
    onSnapshot(unitsRef, async () => {
        try {
            console.log('Units collection updated, refreshing attached units status display');

            // Refresh attached units for all calls to show updated unit statuses
            const callsContainer = document.getElementById('calls-container');
            if (!callsContainer) return;            const callCards = callsContainer.querySelectorAll('.call-card');
            for (const callCard of callCards) {
                const callId = callCard.dataset.callId;
                const attachedUnitsContainer = callCard.querySelector('.attached-units-compact');
                if (callId && attachedUnitsContainer) {
                    await renderAttachedUnitsForCallCompact(callId, attachedUnitsContainer);
                }
            }

            // Also refresh the selected call's attached units to show updated statuses
            if (window.selectedCall) {
                const attachedUnitsDetailsContainer = document.getElementById('attached-units-container');
                if (attachedUnitsDetailsContainer) {
                    await renderAttachedUnitsForSelectedCall(window.selectedCall.id, attachedUnitsDetailsContainer);
                }
            }
        } catch (error) {
            console.error("Error handling units status updates:", error);
        }
    }, (error) => {
        console.error("Error listening for units updates:", error);
    });

    // Set up dynamic fade visibility based on scroll position
    function setupFadeScrollHandler() {
        const callsContainer = document.getElementById('calls-container');
        if (!callsContainer) return;
        // Select fade overlays as siblings of #calls-container
        const fadeTop = callsContainer.previousElementSibling && callsContainer.previousElementSibling.classList.contains('calls-fade-top')
            ? callsContainer.previousElementSibling : document.querySelector('.calls-fade-top');
        const fadeBottom = callsContainer.nextElementSibling && callsContainer.nextElementSibling.classList.contains('calls-fade-bottom')
            ? callsContainer.nextElementSibling : document.querySelector('.calls-fade-bottom');
        if (!fadeTop || !fadeBottom) return;

        function updateFadeVisibility() {
            const { scrollTop, scrollHeight, clientHeight } = callsContainer;
            const isAtTop = scrollTop <= 2; // Small threshold for precision
            const isAtBottom = scrollTop >= scrollHeight - clientHeight - 2;
            // Hide top fade when at the top
            if (isAtTop) {
                fadeTop.classList.add('hidden');
            } else {
                fadeTop.classList.remove('hidden');
            }
            // Hide bottom fade when at the bottom
            if (isAtBottom) {
                fadeBottom.classList.add('hidden');
            } else {
                fadeBottom.classList.remove('hidden');
            }
        }
        // Initial check
        updateFadeVisibility();
        // Listen for scroll events
        callsContainer.addEventListener('scroll', updateFadeVisibility);        // Listen for content changes that might affect scroll
        const observer = new MutationObserver(updateFadeVisibility);
        observer.observe(callsContainer, { childList: true, subtree: true });
    }
    
    // Initialize fade handler
    setupFadeScrollHandler();
    
    // Initialize self attach/detach button
    setupSelfAttachButton();
    
    // Set up Load Saved Character button event listener
    const loadCharacterBtn = document.getElementById('load-character-btn');
    if (loadCharacterBtn) {
        loadCharacterBtn.addEventListener('click', function() {
            loadCharacterFromSlot();
        });
    }
    
    // Set up Save Details button event listener (in modal)
    const saveDetailsBtn = document.getElementById('save-details-btn');
    if (saveDetailsBtn) {
        saveDetailsBtn.addEventListener('click', function() {
            saveDetails();
        });
    }
      // Populate character slots on page load
    populateCharacterSlots();
      // Set up status button event listeners
    setupStatusButtons();
    
    // Set up panic button event listener
    setupPanicButton();
});

// Function to set up status button event listeners
function setupStatusButtons() {
    const statusButtons = document.querySelectorAll('.status-buttons button[data-status]');
    
    statusButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const status = button.getAttribute('data-status');
            const currentStatus = await getCurrentUnitStatus();
              // Handle dynamic button clicks
            if (button.textContent === 'At Hospital') {
                await handleAtHospitalClick(currentStatus);
                return;
            }
            
            if (button.textContent === 'At Base') {
                await handleAtBaseClick();
                return;
            }
            
            if (button.textContent === 'At Standby') {
                await handleAtStandbyClick();
                return;
            }
            
            // Handle special cases that require modals
            if (status === 'Transporting To Hospital') {
                showHospitalModal(
                    (hospitalLocation, transportType) => {
                        // Update status and show success message
                        const fullStatus = `${status} - ${hospitalLocation} (${transportType})`;
                        handleStatusChange(fullStatus);
                        
                        // Store hospital context for later use
                        sessionStorage.setItem('currentHospital', hospitalLocation);
                        sessionStorage.setItem('transportType', transportType);
                        
                        // Change the button to "At Hospital"
                        updateTransportingButton();
                    },
                    () => {
                        // User cancelled, do nothing
                        console.log('Hospital selection cancelled');
                    }
                );
                return;
            }
              if (status === 'Going To Base') {
                showBaseModal(
                    (baseLocation, baseType) => {
                        const fullStatus = `${status} - ${baseLocation} (${baseType})`;
                        handleStatusChange(fullStatus);
                        
                        // Store base context for later use
                        sessionStorage.setItem('currentBase', baseLocation);
                        sessionStorage.setItem('baseType', baseType);
                        
                        // Change the button to "At Base"
                        updateBaseButton();
                    },
                    () => {
                        console.log('Base selection cancelled');
                    }
                );
                return;
            }
            
            if (status === 'Go To Standby') {
                showStandbyModal(
                    (standbyLocation) => {
                        const fullStatus = `${status} - ${standbyLocation}`;
                        handleStatusChange(fullStatus);
                        
                        // Store standby context for later use
                        sessionStorage.setItem('currentStandbyLocation', standbyLocation);
                        
                        // Change the button to "At Standby"
                        updateStandbyButton();
                    },
                    () => {
                        console.log('Standby selection cancelled');
                    }
                );
                return;
            }
            
            if (status === 'Refueling') {
                showRefuelModal(
                    (fuelLocation) => {
                        handleStatusChange(`${status} - ${fuelLocation}`);
                        showRefuelPriceModal((price) => {
                            showNotification(`Refueling logged: ${price} at ${fuelLocation}`, "success");
                        });
                    },
                    () => {
                        console.log('Refuel location selection cancelled');
                    }
                );
                return;
            }
            
            // For all other statuses, update directly and reset any button modifications
            await handleStatusChange(status);
            resetButtonStates();
        });
    });
}

// Function to get current unit status from database
async function getCurrentUnitStatus() {
    const unitId = sessionStorage.getItem("unitId");
    if (!unitId || unitId === "None") return null;
    
    try {
        const unitRef = doc(db, "units", unitId);
        const unitSnap = await getDoc(unitRef);
        if (unitSnap.exists()) {
            return unitSnap.data().status;
        }
    } catch (error) {
        console.error("Error getting current status:", error);
    }
    return null;
}

// Function to handle "At Hospital" button click
async function handleAtHospitalClick(currentStatus) {
    const hospitalName = sessionStorage.getItem('currentHospital');
    const transportType = sessionStorage.getItem('transportType');
    
    if (!hospitalName) {
        showNotification("No hospital information found. Please select transport to hospital first.", "error");
        return;
    }
    
    let newStatus;
    if (transportType === 'Transporting') {
        newStatus = `At Hospital Cleaning - ${hospitalName}`;
    } else if (transportType === 'Standby') {
        newStatus = `At Hospital Standby - ${hospitalName}`;
    } else {
        // Default case if transport type is unclear
        newStatus = `At Hospital Cleaning - ${hospitalName}`;
    }
    
    await handleStatusChange(newStatus);
    
    // Reset the button back to "Transporting To Hospital"
    resetTransportingButton();
    
    // Clear hospital context
    sessionStorage.removeItem('currentHospital');
    sessionStorage.removeItem('transportType');
}

// Function to update the transporting button to "At Hospital"
function updateTransportingButton() {
    const transportButton = document.querySelector('button[data-status="Transporting To Hospital"]');
    if (transportButton) {
        transportButton.textContent = 'At Hospital';
        transportButton.style.backgroundColor = '#ff9800'; // Orange color to indicate different state
        transportButton.classList.add('selected-status');
    }
}

// Function to reset the transporting button back to original state
function resetTransportingButton() {
    const transportButton = document.querySelector('button[data-status="Transporting To Hospital"]');
    if (transportButton) {
        transportButton.textContent = 'Transporting To Hospital';
        transportButton.style.backgroundColor = ''; // Reset to default
        transportButton.classList.remove('selected-status');
    }
}

// Function to handle "At Base" button click
async function handleAtBaseClick() {
    const baseName = sessionStorage.getItem('currentBase');
    const baseType = sessionStorage.getItem('baseType');
    
    if (!baseName) {
        showNotification("No base information found. Please select going to base first.", "error");
        return;
    }
    
    let newStatus;
    if (baseType === 'Standby') {
        newStatus = `At Base Standby - ${baseName}`;
    } else if (baseType === 'Replenishing') {
        newStatus = `At Base Replenishing - ${baseName}`;
    } else {
        newStatus = `At Base Standby - ${baseName}`;
    }
    
    await handleStatusChange(newStatus);
    
    // Reset the button back to "Going To Base"
    resetBaseButton();
    
    // Clear base context
    sessionStorage.removeItem('currentBase');
    sessionStorage.removeItem('baseType');
}

// Function to handle "At Standby" button click
async function handleAtStandbyClick() {
    const standbyLocation = sessionStorage.getItem('currentStandbyLocation');
    
    if (!standbyLocation) {
        showNotification("No standby location found. Please select go to standby first.", "error");
        return;
    }
    
    const newStatus = `At Standby - ${standbyLocation}`;
    await handleStatusChange(newStatus);
    
    // Reset the button back to "Go To Standby"
    resetStandbyButton();
    
    // Clear standby context
    sessionStorage.removeItem('currentStandbyLocation');
}

// Function to update the base button to "At Base"
function updateBaseButton() {
    const baseButton = document.querySelector('button[data-status="Going To Base"]');
    if (baseButton) {
        baseButton.textContent = 'At Base';
        baseButton.style.backgroundColor = '#ff9800'; // Orange color to indicate different state
        baseButton.classList.add('selected-status');
    }
}

// Function to reset the base button back to original state
function resetBaseButton() {
    const baseButton = document.querySelector('button[data-status="Going To Base"]');
    if (baseButton) {
        baseButton.textContent = 'Going To Base';
        baseButton.style.backgroundColor = ''; // Reset to default
        baseButton.classList.remove('selected-status');
    }
}

// Function to update the standby button to "At Standby"
function updateStandbyButton() {
    const standbyButton = document.querySelector('button[data-status="Go To Standby"]');
    if (standbyButton) {
        standbyButton.textContent = 'At Standby';
        standbyButton.style.backgroundColor = '#ff9800'; // Orange color to indicate different state
        standbyButton.classList.add('selected-status');
    }
}

// Function to reset the standby button back to original state
function resetStandbyButton() {
    const standbyButton = document.querySelector('button[data-status="Go To Standby"]');
    if (standbyButton) {
        standbyButton.textContent = 'Go To Standby';
        standbyButton.style.backgroundColor = ''; // Reset to default
        standbyButton.classList.remove('selected-status');
    }
}

// Function to reset all button states to default
function resetButtonStates() {
    resetTransportingButton();
    resetBaseButton();
    resetStandbyButton();
    // Add other button resets here as needed
}

// Function to debug log all attached units
async function debugLogAllAttachedUnits() {
    try {
        console.log('=== DEBUG: All Attached Units ===');
        const attachedUnitsRef = collection(db, "attachedUnit");
        const attachedUnitsSnapshot = await getDocs(attachedUnitsRef);
        
        if (attachedUnitsSnapshot.empty) {
            console.log('No attached units found in database');
            return;
        }
        
        for (const docSnap of attachedUnitsSnapshot.docs) {
            const data = docSnap.data();
            console.log(`Attached Unit Doc ID: ${docSnap.id}`, data);
            
            // Also get the unit details for context
            if (data.unitID) {
                const unitRef = doc(db, "units", data.unitID);
                const unitSnap = await getDoc(unitRef);
                if (unitSnap.exists()) {
                    console.log(`  -> Unit Details:`, unitSnap.data());
                } else {
                    console.warn(`  -> Unit ID ${data.unitID} not found in units collection`);
                }
            }
        }
    } catch (error) {
        console.error('Error in debugLogAllAttachedUnits:', error);
    }
}

// Function to set up self attach button functionality
function setupSelfAttachButton() {
    const selfAttachBtn = document.getElementById('self-attach-btn');
    if (!selfAttachBtn) {
        console.warn('Self attach button not found');
        return;
    }
    
    selfAttachBtn.addEventListener('click', async function() {
        const unitId = sessionStorage.getItem('unitId');
        if (!unitId || unitId === 'None') {
            showNotification('No valid Unit ID found. Cannot attach to call.', 'error');
            return;
        }
        
        if (!window.selectedCall) {
            showNotification('No call selected. Please select a call first.', 'error');
            return;
        }
        
        try {
            // Check if unit is already attached to this call
            const attachedUnitQuery = query(
                collection(db, "attachedUnit"),
                where("unitID", "==", unitId),
                where("callID", "==", window.selectedCall.id)
            );
            const existingAttachment = await getDocs(attachedUnitQuery);
            
            if (!existingAttachment.empty) {
                showNotification('You are already attached to this call.', 'warning');
                return;
            }
            
            // Attach the unit to the selected call
            await addDoc(collection(db, "attachedUnit"), {
                unitID: unitId,
                callID: window.selectedCall.id
            });
            
            // Play sound for attachment
            playSoundByKey('callupdate');
            showNotification('Successfully attached to call!', 'success');
            
            // Refresh the attached units display
            const attachedUnitsContainer = document.getElementById('attached-units-container');
            if (attachedUnitsContainer) {
                await renderAttachedUnitsForSelectedCall(window.selectedCall.id, attachedUnitsContainer);
            }
            
        } catch (error) {
            console.error('Error attaching to call:', error);
            showNotification('Failed to attach to call. Please try again.', 'error');
        }
    });
}

// Function to update dispatcher count display
function updateDispatcherCount(snapshot) {
    const counterDiv = document.getElementById('dispatcher-counter-display');
    
    // Create the counter display if it doesn't exist
    if (!counterDiv) {
        const newCounterDiv = document.createElement('div');
        newCounterDiv.id = 'dispatcher-counter-display';
        newCounterDiv.style.position = 'fixed';
        newCounterDiv.style.bottom = '20px';
        newCounterDiv.style.right = '20px';
        newCounterDiv.style.background = '#0288D1';
        newCounterDiv.style.color = '#fff';
        newCounterDiv.style.padding = '10px 20px';
        newCounterDiv.style.borderRadius = '12px';
        newCounterDiv.style.fontWeight = 'bold';
        newCounterDiv.style.fontSize = '1em';
        newCounterDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        newCounterDiv.style.zIndex = '9998';
        document.body.appendChild(newCounterDiv);
    }
    
    const displayElement = document.getElementById('dispatcher-counter-display');
    if (displayElement) {
        if (snapshot && snapshot.size !== undefined) {
            // Subtract 1 to exclude placeholder or self-count
            const count = Math.max(0, snapshot.size - 1);
            displayElement.textContent = `Active Dispatchers: ${count}`;
        } else {
            displayElement.textContent = 'Active Dispatchers: ?';
        }
    }
}

// Function to set up panic button event listener
function setupPanicButton() {
    const panicButton = document.querySelector('.panic-button');
    
    if (panicButton) {
        panicButton.addEventListener('click', async () => {
            const unitId = sessionStorage.getItem("unitId");
            const civilianId = sessionStorage.getItem("civilianId");
            
            if (!unitId || unitId === "None") {
                showNotification("No valid UnitID found. Cannot trigger panic.", "error");
                return;
            }
            
            try {
                // Create panic alert in database
                await addDoc(collection(db, "panicAlerts"), {
                    unitId: unitId,
                    civilianId: civilianId || "Unknown",
                    timestamp: new Date(),
                    status: "Active",
                    location: "Unknown" // Could be enhanced to get GPS location
                });
                
                // Update unit status to indicate panic
                const unitRef = doc(db, "units", unitId);
                await updateDoc(unitRef, { 
                    status: "PANIC - Emergency Assistance Required",
                    lastPanicTime: new Date()
                });
                
                // Update UI
                updateStatusIndicator("PANIC - Emergency Assistance Required");
                
                // Visual feedback - flash the button red
                panicButton.style.backgroundColor = "#ff0000";
                panicButton.style.color = "#ffffff";
                panicButton.style.animation = "flash 1s infinite";
                
                // Play panic sound
                playSoundByKey('panic');
                
                showNotification("PANIC ALERT ACTIVATED - Emergency services notified!", "error");
                
                // Reset button appearance after 5 seconds
                setTimeout(() => {
                    panicButton.style.backgroundColor = "";
                    panicButton.style.color = "";
                    panicButton.style.animation = "";
                }, 5000);
                
            } catch (error) {
                showNotification("Failed to send panic alert. Please try again.", "error");
                console.error("Error sending panic alert:", error);
            }
        });
    }
}

// Call this at startup for troubleshooting
window.debugLogAllAttachedUnits = debugLogAllAttachedUnits;

// Add global debug functions for browser console testing
window.testAttachedUnits = async function() {
    console.log('=== TESTING ALL ATTACHED UNITS ===');
    await debugLogAllAttachedUnits();
};

window.testCallsData = async function() {
    console.log('=== TESTING ALL CALLS DATA ===');
    try {
        const callsRef = collection(db, 'calls');
        const snapshot = await getDocs(callsRef);
        console.log('Total calls in database:', snapshot.size);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            console.log(`Call ID: ${doc.id}`, data);
        });
    } catch (err) {
        console.error('Error fetching calls:', err);
    }
};

window.testSpecificCallAttachedUnits = async function(callId) {
    console.log(`=== TESTING ATTACHED UNITS FOR CALL ${callId} ===`);
    await debugLogAttachedUnitsForCall(callId);
};

window.forceRenderAttachedUnits = async function() {
    console.log('=== FORCE RENDERING ATTACHED UNITS FOR ALL CALLS ===');
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) {
        console.log('No calls container found');
        return;
    }
    
    const callCards = callsContainer.querySelectorAll('.call-card');
    console.log('Found', callCards.length, 'call cards');
    
    for (const callCard of callCards) {
        const callId = callCard.dataset.callId;
        const attachedUnitsContainer = callCard.querySelector('.attached-units-compact');
        if (callId && attachedUnitsContainer) {
            console.log(`Force rendering for call ${callId}`);
            await renderAttachedUnitsForCallCompact(callId, attachedUnitsContainer);
        }
    }
};
