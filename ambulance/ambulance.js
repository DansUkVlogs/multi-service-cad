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

function playSound(audioUrl) {
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
        await updateDoc(unitRef, { status });
        // Play the status change sound
        console.log('[AUDIO] Status change sound should play (statuschange)');
        playSoundByKey('statuschange');
        // Show a notification
        showNotification(`Status changed to: ${status}`, "success");
        // Update the button styles
        document.querySelectorAll(".status-buttons button").forEach((button) => {
            button.classList.remove("selected-status");
        });
        const selectedButton = document.querySelector(`button[data-status="${status}"]`);
        if (selectedButton) {
            selectedButton.classList.add("selected-status");
        }
        // Update the status indicator
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
            });

            // --- Set status to Available after logging ---
            if (unitId) {
                await updateDoc(doc(db, "units", unitId), { status: "Available" });
                document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                const availableBtn = document.querySelector('button[data-status="Available"]');
                if (availableBtn) availableBtn.classList.add("selected-status");
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

// Smart dispatcher state management - track previous state to only clear UI on capability transitions
let previousDispatcherState = null; // null = unknown, true = self-dispatch capable, false = not self-dispatch capable

// Function to update dispatcher count and manage calls list visibility with smart state transitions
function updateDispatcherCount(snapshot) {
    try {
        let count = snapshot ? snapshot.size : 0;
        if (count > 0) count = count - 1;
        const counterDiv = document.getElementById('dispatcher-counter-display');
        const callsContainer = document.getElementById('calls-container');

        if (counterDiv) {
            counterDiv.textContent = `Active Dispatchers: ${count}`;
        }

        // Determine current dispatcher capability state
        const currentSelfDispatchCapable = count < 1; // True when no dispatchers (self-dispatch), false when dispatchers online (managed)

        // Update incident field for currently selected call based on dispatcher status
        const incidentElement = document.querySelector('.incident');
        if (incidentElement && window.selectedCall) {
            // Always show call status in incident field (consistent with requirement)
            incidentElement.textContent = `Incident: ${window.selectedCall.status || 'Unknown'}`;
        }

        // Only clear UI and transition states when switching between self-dispatch capabilities
        if (previousDispatcherState !== null && previousDispatcherState !== currentSelfDispatchCapable) {
            console.log(`Smart state transition: Self-dispatch capable changed from ${previousDispatcherState} to ${currentSelfDispatchCapable}`);

            // Clear call details only on capability transition
            if (window.selectedCall) {
                window.selectedCall = null;

                // Clear call details display
                const callerNameElement = document.querySelector('.callerName');
                const descriptionElement = document.querySelector('.descriptionText');
                const locationElement = document.querySelector('.location');
                const timestampElement = document.querySelector('.timestamp');
                const attachedUnitsContainer = document.getElementById('attached-units-container');

                if (callerNameElement) callerNameElement.textContent = '';
                if (descriptionElement) descriptionElement.textContent = '';
                if (locationElement) locationElement.textContent = '';
                if (incidentElement) incidentElement.textContent = 'Incident: ';
                if (timestampElement) timestampElement.textContent = '';
                if (attachedUnitsContainer) attachedUnitsContainer.innerHTML = '';

                // Remove selection highlighting
                document.querySelectorAll('.call-card').forEach(card => {
                    card.classList.remove('selected');
                });
            }
        }

        // Update calls container based on current state
        if (currentSelfDispatchCapable) {
            // Self-dispatch capable: Show calls list
            const wasShowingDispatcherMessage = callsContainer && callsContainer.innerHTML.includes('There is an active dispatcher');

            if (wasShowingDispatcherMessage || callsContainer.innerHTML === '') {
                console.log('Transitioning to self-dispatch mode, loading calls list');
                refreshCallsList();
            }
        } else {
            // Not self-dispatch capable: Show dispatcher management message
            if (callsContainer) {
                callsContainer.innerHTML = '<div style="text-align: center; padding: 20px; font-size: 18px; color: #0288D1; font-weight: bold;">There is an active dispatcher online. Calls are being managed by dispatch.</div>';
            }
        }

        // Update previous state for next comparison
        previousDispatcherState = currentSelfDispatchCapable;

    } catch (e) {
        console.error('Error in updateDispatcherCount:', e);
        // Fallback: show unknown
        const counterDiv = document.getElementById('dispatcher-counter-display');
        if (counterDiv) counterDiv.textContent = 'Active Dispatchers: ?';
    }
}

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
    console.log('Initializing real-time listeners for attached units and unit status updates');

    // Listen for changes in the "attachedUnits" collection
    const attachedUnitsRef = collection(db, "attachedUnits");
    onSnapshot(attachedUnitsRef, async () => {
        try {
            console.log('AttachedUnits collection updated, refreshing attached units display');

            // Refresh attached units for all calls in the calls list
            const callsContainer = document.getElementById('calls-container');
            if (!callsContainer) return;

            const callCards = callsContainer.querySelectorAll('.call-card');
            for (const callCard of callCards) {
                const callId = callCard.dataset.callId;
                const attachedUnitsContainer = callCard.querySelector('.attached-units div');
                if (callId && attachedUnitsContainer) {
                    await renderAttachedUnitsForCall(callId, attachedUnitsContainer);
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
            console.error("Error handling attachedUnits updates:", error);
        }
    }, (error) => {
        console.error("Error listening for attachedUnits updates:", error);
    });

    // Listen for changes in the "units" collection to update unit status in real-time
    const unitsRef = collection(db, "units");
    onSnapshot(unitsRef, async () => {
        try {
            console.log('Units collection updated, refreshing attached units status display');

            // Refresh attached units for all calls to show updated unit statuses
            const callsContainer = document.getElementById('calls-container');
            if (!callsContainer) return;

            const callCards = callsContainer.querySelectorAll('.call-card');
            for (const callCard of callCards) {
                const callId = callCard.dataset.callId;
                const attachedUnitsContainer = callCard.querySelector('.attached-units div');
                if (callId && attachedUnitsContainer) {
                    await renderAttachedUnitsForCall(callId, attachedUnitsContainer);
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
        callsContainer.addEventListener('scroll', updateFadeVisibility);
        // Listen for content changes that might affect scroll
        const observer = new MutationObserver(updateFadeVisibility);
        observer.observe(callsContainer, { childList: true, subtree: true });
    }

    // Initialize fade handler
    setupFadeScrollHandler();
});

async function displayCalls(calls) {
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) return;

    callsContainer.innerHTML = ''; // Clear existing calls

    if (calls.length === 0) {
        console.log('No calls available to display.');
        callsContainer.innerHTML = '<p>No calls available.</p>'; // Show a message if no calls are available
        return;
    }

    console.log('Displaying calls:', calls); // Log the calls being displayed

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

        // Add comprehensive tooltip for the entire call card
        const fullTimestamp = call.timestamp ? 
            (call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp)).toLocaleString('en-GB') : 'N/A';
        const callCardTooltip = `Call ID: ${call.id} | Service: ${call.service || 'Unknown'} | Status: ${call.status || 'Unknown'} | Location: ${call.location || 'Unknown'} | Caller: ${call.callerName || 'Unknown'} | Time: ${fullTimestamp}`;
        callCard.title = callCardTooltip;

        const serviceColor = getUnitTypeColor(call.service);

        // Format the timestamp for compact display
        let formattedTimestamp = 'N/A';
        if (call.timestamp) {
            const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            formattedTimestamp = timestamp.toLocaleTimeString('en-GB', { 
                hour: '2-digit', 
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: '2-digit' 
            });
        }

        callCard.innerHTML = `
            <div class="call-service-section" title="Service: ${call.service || 'Unknown'} | Location: ${call.location || 'Location not provided'}">
                <div class="call-service" style="background-color: ${serviceColor};">${(call.service || 'UNK').substring(0, 3).toUpperCase()}</div>
                <div class="call-location-under-service">${call.location || 'Location not provided'}</div>
            </div>
            <div class="call-status-caller-container" title="Status: ${call.status || 'Unknown'} | Caller: ${call.callerName || 'Unknown'}">
                <div class="call-status">${call.status || 'Unknown'}</div>
                <div class="caller-name">${call.callerName || 'Unknown'}</div>
            </div>
            <div class="attached-units-compact" title="Attached Units"></div>
            <div class="call-timestamp" title="Call Time: ${formattedTimestamp}">${formattedTimestamp}</div>
        `;        // Attach click event listener to select the call
        callCard.addEventListener('click', () => selectCall(call));

        callsContainer.appendChild(callCard);

        // Render attached units for this call in compact format
        const attachedUnitsContainer = callCard.querySelector('.attached-units-compact');
        if (attachedUnitsContainer) {
            renderAttachedUnitsForCallCompact(call.id, attachedUnitsContainer);
        }
    });
}

// Function to render attached units for a specific call in compact format with unit cards
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
                console.warn(`Unit with ID ${unitID} not found.`);
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

// Function to handle call selection and update call details display
async function selectCall(call) {
    try {
        // Update call details in the UI
        const callerNameElement = document.querySelector('.callerName');
        const descriptionElement = document.querySelector('.descriptionText');
        const locationElement = document.querySelector('.location');
        const incidentElement = document.querySelector('.incident');
        const timestampElement = document.querySelector('.timestamp');

        if (callerNameElement) {
            callerNameElement.textContent = call.callerName || 'Unknown';
        }
        if (descriptionElement) {
            descriptionElement.textContent = call.description || 'No description provided';
        }
        if (locationElement) {
            locationElement.textContent = call.location || 'Location not provided';
        }
        if (incidentElement) {
            incidentElement.textContent = call.status || 'Unknown';
        }
        if (timestampElement && call.timestamp) {
            const timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            timestampElement.textContent = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
        }
        // Store selected call data for potential self-attach functionality
        window.selectedCall = call;
        // Set up real-time listener for the selected call
        if (window.setupSelectedCallListener) {
            window.setupSelectedCallListener(call.id);
        }
        // Render attached units for the selected call in call details section
        const attachedUnitsContainer = document.getElementById('attached-units-container');
        if (attachedUnitsContainer) {
            await renderAttachedUnitsForSelectedCall(call.id, attachedUnitsContainer);
        }
        // Visual feedback - highlight selected call
        document.querySelectorAll('.call-card').forEach(card => {
            card.classList.remove('selected');
        });
        // Find and highlight the clicked call card
        const selectedCard = document.querySelector(`[data-call-id="${call.id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    } catch (error) {
        console.error('Error selecting call:', error);
        showNotification('Error selecting call', 'error');
    }
}

// Function to refresh call details for the currently selected call
async function refreshSelectedCallDetails() {
    if (!window.selectedCall) return;

    try {
        // Get the latest call data from the database
        const callDoc = await getDoc(doc(db, "calls", window.selectedCall.id));
        if (!callDoc.exists()) {
            console.log("Selected call no longer exists");
            return;
        }

        // Update the stored selected call with latest data
        const updatedCall = { id: callDoc.id, ...callDoc.data() };
        window.selectedCall = updatedCall;

        // Update call details in the UI
        const callerNameElement = document.querySelector('.callerName');
        const descriptionElement = document.querySelector('.descriptionText');
        const locationElement = document.querySelector('.location');
        const incidentElement = document.querySelector('.incident');
        const timestampElement = document.querySelector('.timestamp');

        if (callerNameElement) {
            callerNameElement.textContent = updatedCall.callerName || 'Unknown';
        }

        if (descriptionElement) {
            descriptionElement.textContent = updatedCall.description || 'No description provided';
        }

        if (locationElement) {
            locationElement.textContent = updatedCall.location || 'Location not provided';
        }
          // Update incident field with call status
        if (incidentElement) {
            incidentElement.textContent = updatedCall.status || 'Unknown';
        }

        if (timestampElement && updatedCall.timestamp) {
            const timestamp = updatedCall.timestamp.toDate ? updatedCall.timestamp.toDate() : new Date(updatedCall.timestamp);
            timestampElement.textContent = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
        }

        // Refresh attached units for the selected call
        const attachedUnitsContainer = document.getElementById('attached-units-container');
        if (attachedUnitsContainer) {
            await renderAttachedUnitsForSelectedCall(updatedCall.id, attachedUnitsContainer);
        }

    } catch (error) {
        console.error('Error refreshing selected call details:', error);
    }
}

// Function to save call details for the selected call
async function saveSelectedCallDetails() {
    if (!window.selectedCall || !window.selectedCall.id) {
        showNotification("No call selected to save.", "error");
        return;
    }
    const callId = window.selectedCall.id;
    const description = document.querySelector(".descriptionText")?.value.trim();
    if (!description) {
        showNotification("Description cannot be empty.", "error");
        return;
    }
    try {
        await updateDoc(doc(db, "calls", callId), { description });
        showNotification("Call details saved!", "success");
        await refreshSelectedCallDetails();
    } catch (error) {
        showNotification("Failed to save call details.", "error");
        console.error("Error saving call details:", error);
    }
}

// Attach event listener to the Save Details button in call details section
function setupCallDetailsSaveButton() {
    const btn = document.querySelector(".save-details-btn");
    if (btn) {
        btn.addEventListener("click", saveSelectedCallDetails);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupCallDetailsSaveButton();
});

// Attach event listeners
document.addEventListener("DOMContentLoaded", () => {
    // Instead, use openSetupModal to show the modal on page load if needed:
    openSetupModal();

    // Populate character slots
    populateCharacterSlots();

    // Attach event listener to the "Load Saved Character" button
    const loadCharacterBtn = document.getElementById("load-character-btn");
    if (loadCharacterBtn) {
        loadCharacterBtn.addEventListener("click", loadCharacterFromSlot);
    } else {
        console.error("Load Character button not found.");
    }

    // Attach event listener to the "Save Details" button
    const saveDetailsBtn = document.getElementById("save-details-btn");
    if (saveDetailsBtn) {
        saveDetailsBtn.addEventListener("click", saveDetails);
    } else {
        console.error("Save Details button not found.");
    }

    // Display current IDs
    displayCurrentIDs();

    const statusButtons = [
        "Available",
        "En Route",
        "On Scene",
        "Unavailable",
        "Busy",
        "Meal Break",
        "On Duty",
        "Transporting To Hospital",
        "Going To Base",
        "Go To Standby"
    ];

    document.querySelectorAll(".status-buttons button").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
            const status = btn.getAttribute("data-status");
            const unitId = sessionStorage.getItem("unitId");
            if (!unitId || unitId === "None") {
                showNotification("No valid UnitID found. Cannot change status.", "error");
                return;
            }

            // --- Check if unit is in availableUnits or attachedUnit, add to availableUnits if not ---
            try {
                // Check attachedUnit (unitID)
                let isAttached = false;
                const attachedUnitsSnap = await getDocs(collection(db, "attachedUnit"));
                for (const docSnap of attachedUnitsSnap.docs) {
                    const data = docSnap.data();
                    if (data.unitID === unitId) {
                        isAttached = true;
                        break;
                    }
                }
                // Check availableUnits (unitId)
                let isAvailable = false;
                const availableUnitsSnap = await getDocs(collection(db, "availableUnits"));
                for (const docSnap of availableUnitsSnap.docs) {
                    const data = docSnap.data();
                    if (data.unitId === unitId) {
                        isAvailable = true;
                        break;
                    }
                }
                // If not attached and not available, add to availableUnits
                if (!isAttached && !isAvailable) {
                    await addDoc(collection(db, "availableUnits"), { unitId });
                }
            } catch (e) {
                // Optionally log or notify error, but don't block status change
                console.warn("Error checking/adding to availableUnits:", e);
            }

            // --- At Hospital button logic (must come BEFORE Transporting To Hospital logic) ---
            if (status === "At Hospital") {
                // Use stored hospital info from button dataset
                const location = btn.dataset.hospitalLocation || "Unknown";
                const transportType = btn.dataset.hospitalType || "Transport";
                let newStatus = `At Hospital - ${location}`;
                if (transportType === "Transport") {
                    newStatus += " (Cleaning)";
                } else if (transportType === "Standby") {
                    newStatus += " (Standby)";
                }
                try {
                    await updateDoc(doc(db, "units", unitId), { status: newStatus });
                    updateStatusGradientBar(newStatus);
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                    btn.classList.add("selected-status");
                    showNotification(`Status changed to: ${newStatus}`, "success");
                    // Reset button text and status for next use
                    btn.textContent = "Transporting To Hospital";
                    btn.setAttribute("data-status", "Transporting To Hospital");
                    delete btn.dataset.hospitalLocation;
                    delete btn.dataset.hospitalType;
                    // Remove flashing from all buttons
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                    // Update the status indicator
                    updateStatusIndicator(newStatus);
                    return;
                } catch (e) {
                    showNotification("Failed to update status.", "error");
                }
                return;
            }

            // --- Transporting To Hospital button logic ---
            if (status === "Transporting To Hospital") {
                // Only open modal if we are not already in At Hospital mode
                // (If At Hospital, the above block will handle it and return)
                showHospitalModal(
                    async (location, transportType) => {
                        let newStatus;
                        if (transportType === "Transport") {
                            newStatus = `Transporting To Hospital - ${location}`;
                        } else if (transportType === "Standby") {
                            newStatus = `Going To Hospital - ${location}`;
                        } else {
                            showNotification("Invalid transport type selected.", "error");
                            return;
                        }
                        try {
                            await updateDoc(doc(db, "units", unitId), { status: newStatus });
                            updateStatusGradientBar(newStatus);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            btn.classList.add("selected-status");
                            // Save hospital info to button dataset for later
                            btn.textContent = "At Hospital";
                            btn.setAttribute("data-status", "At Hospital");
                            btn.dataset.hospitalLocation = location;
                            btn.dataset.hospitalType = transportType;
                            // Remove flashing from all buttons before adding
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                            // Flash the button
                            btn.classList.add("flashing");
                            showNotification(`Status changed to: ${newStatus}`, "success");
                            // Update the status indicator
                            updateStatusIndicator(newStatus);
                        } catch (e) {
                            showNotification("Failed to update status.", "error");
                        }
                    },
                    () => {}
                );
                return;
            }

            // --- At Base button logic (must come BEFORE Going To Base logic) ---
            if (status === "At Base") {
                const baseLocation = btn.dataset.baseLocation || "Unknown";
                const baseType = btn.dataset.baseType || "Standby";
                let newStatus;
                if (baseType === "Replenishing") {
                    newStatus = `At Base - Replenishing at ${baseLocation}`;
                } else {
                    newStatus = `At Base - ${baseLocation}`;
                }
                try {
                    await updateDoc(doc(db, "units", unitId), { status: newStatus });
                    updateStatusGradientBar(newStatus);
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                    btn.classList.add("selected-status");
                    showNotification(`Status changed to: ${newStatus}`, "success");
                    // Reset button text and status for next use
                    btn.textContent = "Going To Base";
                    btn.setAttribute("data-status", "Going To Base");
                    delete btn.dataset.baseLocation;
                    delete btn.dataset.baseType;
                    // Remove flashing from all buttons
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                    // Update the status indicator
                    updateStatusIndicator(newStatus);
                    return;
                } catch (e) {
                    showNotification("Failed to update status.", "error");
                }
                return;
            }

            // --- Going To Base button logic ---
            if (status === "Going To Base") {
                showBaseModal(
                    async (location, baseType) => {
                        let newStatus;
                        if (baseType === "Replenishing") {
                            newStatus = `Going to Replenish at base - ${location}`;
                        } else {
                            newStatus = `Going To Base - ${location}`;
                        }
                        try {
                            await updateDoc(doc(db, "units", unitId), { status: newStatus });
                            updateStatusGradientBar(newStatus);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            // Remove flashing from all buttons before adding
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                            btn.classList.add("selected-status");
                            btn.textContent = "At Base";
                            btn.setAttribute("data-status", "At Base");
                            btn.dataset.baseLocation = location;
                            btn.dataset.baseType = baseType;
                            // Flash the button
                            btn.classList.add("flashing");
                            showNotification(`Status changed to: ${newStatus}`, "success");
                            // Update the status indicator
                            updateStatusIndicator(newStatus);
                        } catch (e) {
                            showNotification("Failed to update status.", "error");
                        }
                    },
                    () => {}
                );
                return;
            }

            // --- At Standby button logic (must come BEFORE Go To Standby logic) ---
            if (status === "At Standby") {
                const standbyLocation = btn.dataset.standbyLocation || "Unknown";
                let newStatus = `At Standby - ${standbyLocation}`;
                try {
                    await updateDoc(doc(db, "units", unitId), { status: newStatus });
                    updateStatusGradientBar(newStatus);
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                    btn.classList.add("selected-status");
                    showNotification(`Status changed to: ${newStatus}`, "success");
                    // Reset button text and status for next use
                    btn.textContent = "Go To Standby";
                    btn.setAttribute("data-status", "Go To Standby");
                    delete btn.dataset.standbyLocation;
                    // Remove flashing from all buttons
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                    // Update the status indicator
                    updateStatusIndicator(newStatus);
                    return;
                } catch (e) {
                    showNotification("Failed to update status.", "error");
                }
                return;
            }

            // --- Go To Standby button logic ---
            if (status === "Go To Standby") {
                showStandbyModal(
                    async (location) => {
                        let newStatus = `Going To Standby - ${location}`;
                        try {
                            await updateDoc(doc(db, "units", unitId), { status: newStatus });
                            updateStatusGradientBar(newStatus);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            // Remove flashing from all buttons before adding
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                            btn.classList.add("selected-status");
                            btn.textContent = "At Standby";
                            btn.setAttribute("data-status", "At Standby");
                            btn.dataset.standbyLocation = location;
                            // Flash the button
                            btn.classList.add("flashing");
                            showNotification(`Status changed to: ${newStatus}`, "success");
                            // Update the status indicator
                            updateStatusIndicator(newStatus);
                        } catch (e) {
                            showNotification("Failed to update status.", "error");
                        }
                    },
                    () => {}
                );
                return;
            }

            // --- Refueling button logic ---
            if (status === "Refueling") {
                showRefuelModal(
                    async (location) => {
                        let newStatus = `Refueling - ${location}`;
                        try {
                            await updateDoc(doc(db, "units", unitId), { status: newStatus });
                            updateStatusGradientBar(newStatus);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("flashing"));
                            btn.classList.add("selected-status");
                            btn.textContent = "Refueling";
                            btn.setAttribute("data-status", "Refueling");
                            btn.dataset.refuelLocation = location;
                            // Show price modal (cannot be closed except by Save)
                            showRefuelPriceModal(async (price) => {
                                // Optionally, you could save the price somewhere (not specified)
                                // After price is saved, set status to Available
                                try {
                                    await updateDoc(doc(db, "units", unitId), { status: "Available" });
                                    updateStatusGradientBar("Available");
                                    // Reset button text/status if needed
                                    btn.textContent = "Refueling";
                                    btn.setAttribute("data-status", "Refueling");
                                    delete btn.dataset.refuelLocation;
                                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                                    document.querySelector('button[data-status="Available"]').classList.add("selected-status");
                                    showNotification("Status changed to: Available", "success");
                                } catch (e) {
                                    showNotification("Failed to update status.", "error");
                                }
                            });
                        } catch (e) {
                            showNotification("Failed to update status.", "error");
                        }
                    },
                    () => {}
                );
                return;
            }

            // --- Handle En Route, On Scene, Unavailable, Busy, Meal Break, Available, etc. ---
            if (
                status === "En Route" ||
                status === "On Scene" ||
                status === "Unavailable" ||
                status === "Busy" ||
                status === "Meal Break" ||
                status === "Available"
                // ...add other statuses as needed
            ) {
                try {
                    await updateDoc(doc(db, "units", unitId), { status });
                    updateStatusGradientBar(status);
                    document.querySelectorAll(".status-buttons button").forEach(b => {
                        // If button was At Hospital, reset text/status
                        if (b.getAttribute("data-status") === "At Hospital") {
                            b.textContent = "Transporting To Hospital";
                            b.setAttribute("data-status", "Transporting To Hospital");
                            delete b.dataset.hospitalLocation;
                            delete b.dataset.hospitalType;
                        }
                        // If button was At Base, reset text/status
                        if (b.getAttribute("data-status") === "At Base") {
                            b.textContent = "Going To Base";
                            b.setAttribute("data-status", "Going To Base");
                            delete b.dataset.baseLocation;
                        }
                        b.classList.remove("selected-status");
                        // Remove flashing from all buttons
                        b.classList.remove("flashing");
                    });
                    btn.classList.add("selected-status");
                    showNotification(`Status changed to: ${status}`, "success");
                    // Update the status indicator
                    updateStatusIndicator(status);
                } catch (e) {
                    showNotification("Failed to update status.", "error");
                }
                return;
            }

            // ...existing code for other statuses...
        });
    });

    // Close modal when overlay is clicked
    document.getElementById('modal-overlay').addEventListener('click', closeSetupModal);

    // Attach event listener to the "Back to Home" button (main page)
    const backHomeBtn = document.getElementById("back-home-btn");
    if (backHomeBtn) {
        backHomeBtn.addEventListener("click", handleBackToHome);
    }

    // Set initial gradient bar color to match initial status (Unavailable/red by default, no animation)
    const initialBtn = document.querySelector(".status-buttons button.selected-status");
    if (initialBtn) {
        updateStatusGradientBar(initialBtn.getAttribute("data-status"), false);
    } else {
        updateStatusGradientBar("Unavailable", false);
    }

    // Set initial status indicator to Unavailable (deep red)
    const indicator = document.getElementById("current-status-indicator");
    if (indicator) {
        indicator.textContent = "Unavailable";
        indicator.style.background = "#D32F2F";
        indicator.style.color = "#fff";
    }
});

window.addEventListener("unload", () => {
    removeUnitandCharacter();
});

window.addEventListener("beforeunload", (event) => {
    // Call removeUnitandCharacter without await (browser will not wait for async)
    removeUnitandCharacter();
});

// Log all click events at the document level for robust debugging
window.addEventListener('click', function(e) {
    console.log('[DEBUG] Document click event:', e.target, 'tag:', e.target.tagName, 'data-status:', e.target.getAttribute && e.target.getAttribute('data-status'));
});

document.addEventListener('DOMContentLoaded', () => {
    // Log the structure of status-buttons and its children
    const statusButtonsContainer = document.querySelector('.status-buttons');
    if (statusButtonsContainer) {
        console.log('[DEBUG] .status-buttons container found:', statusButtonsContainer);
        const buttons = statusButtonsContainer.querySelectorAll('button');
        buttons.forEach(btn => {
            console.log('[DEBUG] Status button:', btn, 'data-status:', btn.getAttribute('data-status'), 'id:', btn.id, 'class:', btn.className);
        });
    } else {
        console.warn('[DEBUG] .status-buttons container NOT found');
    }
});
