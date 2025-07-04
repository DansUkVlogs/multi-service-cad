// --- Dynamic Hospital Button UI Update ---
// (Removed duplicate definition to resolve SyntaxError)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, getDoc, collection, addDoc, updateDoc, getDocs, setDoc, onSnapshot, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
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

// --- Global State Variables for Self-Attach/Detach System ---
let isUserAttachedToCall = false;
let userAttachedCallId = null;
let selfAttachLockActive = false;
let dispatcherLockActive = false;

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
        // Save description to the selected call in Firestore if a call is selected
        if (window.selectedCall && window.selectedCall.id) {
            const descriptionElement = document.querySelector('.descriptionText');
            let newDescription = '';
            if (descriptionElement && descriptionElement.tagName === 'TEXTAREA') {
                newDescription = descriptionElement.value;
            } else if (descriptionElement) {
                newDescription = descriptionElement.textContent;
            }
            const callDocRef = doc(db, 'calls', window.selectedCall.id);
            await setDoc(callDocRef, { description: newDescription }, { merge: true });
            console.log('[DEBUG] Saved call description to Firestore:', newDescription);
            showNotification('Call details updated successfully.', 'success');
        }
        // --- Save unit/civilian details as before ---
        let unitId = sessionStorage.getItem("unitId");
        let civilianId = sessionStorage.getItem("civilianId");
        let unitDocRef, civilianDocRef;
        const unitData = {
            callsign: callsignInput,
            specificType,
            status: "Unavailable",
            unitType: "Ambulance",
            timestamp: new Date(),
        };
        const civilianData = {
            firstName,
            lastName,
            dob,
            phone,
            profilePicture,
            address,
            timestamp: new Date(),
        };
        const dbUnit = collection(db, "units");
        const dbCiv = collection(db, "civilians");
        if (unitId && unitId !== "None") {
            unitDocRef = doc(db, "units", unitId);
            await setDoc(unitDocRef, unitData, { merge: true });
        } else {
            unitDocRef = await addDoc(dbUnit, unitData);
            unitId = unitDocRef.id;
            sessionStorage.setItem("unitId", unitId);
        }
        if (civilianId && civilianId !== "None") {
            civilianDocRef = doc(db, "civilians", civilianId);
            await setDoc(civilianDocRef, civilianData, { merge: true });
        } else {
            civilianDocRef = await addDoc(dbCiv, civilianData);
            civilianId = civilianDocRef.id;
            sessionStorage.setItem("civilianId", civilianId);
        }
        // Update the displayed IDs
        displayCurrentIDs();
        // hide the background fade
        document.querySelector('.modal-overlay').style.display = 'none';
        // Display the saved callsign on the main page
        const callsignDisplay = document.getElementById("callsign-display");
        callsignDisplay.textContent = callsignInput;
        // --- Force refresh of call details section if a call is selected ---
        if (window.selectedCall && typeof selectCall === 'function') {
            selectCall(window.selectedCall);
        }
        // Ensure the setup modal is closed
        closeSetupModal();
    } catch (error) {
        showNotification('Failed to save details. Please check your network or firewall settings.', 'error');
        console.error('Error saving details:', error);
    }
}

// Function to display current IDs
function displayCurrentIDs() {
    const civilianId = sessionStorage.getItem("civilianId") || "None";
    const unitId = sessionStorage.getItem("unitId") || "None";
    // Determine the most recent location selection
    const hospital = sessionStorage.getItem("hospitalButton_lastHospital") || null;
    const base = sessionStorage.getItem("baseButton_lastBase") || null;
    const standby = sessionStorage.getItem("standbyButton_lastStandby") || null;
    // Use the most recently set location (hospital > base > standby)
    let location = hospital || base || standby || "None";
    // Civilian and Unit
    document.getElementById("civilian-id-display").textContent = `Current CivilianID: ${civilianId}`;
    document.getElementById("unit-id-display").textContent = `Current UnitID: ${unitId}`;
    // Single pill for currently selected location
    let statusBox = document.getElementById("current-location-box");
    if (!statusBox) {
        statusBox = document.createElement("div");
        statusBox.id = "current-location-box";
        statusBox.style.display = "flex";
        statusBox.style.gap = "12px";
        statusBox.style.margin = "10px 0 0 0";
        statusBox.style.flexWrap = "wrap";
        statusBox.style.justifyContent = "flex-start";
        statusBox.style.alignItems = "center";
        document.getElementById("unit-id-display").after(statusBox);
    }
    statusBox.innerHTML = "";
    // Style the pill
    const pill = document.createElement("div");
    pill.textContent = `Currently Selected Location: ${location}`;
    pill.style.fontWeight = "bold";
    pill.style.color = "#0074d9";
    pill.style.background = "#eaf6fb";
    pill.style.padding = "5px 16px";
    pill.style.borderRadius = "16px";
    pill.style.fontSize = "15px";
    pill.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
    pill.style.margin = "2px 0";
    pill.style.display = "inline-block";
    statusBox.appendChild(pill);
}

// Patch modals to update displayCurrentIDs and set only one location at a time
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
        // Clear other locations
        sessionStorage.removeItem('baseButton_lastBase');
        sessionStorage.removeItem('standbyButton_lastStandby');
        sessionStorage.setItem('hospitalButton_lastHospital', location);
        setTimeout(displayCurrentIDs, 0);
        onConfirm(location, transportType);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
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
        // Clear other locations
        sessionStorage.removeItem('hospitalButton_lastHospital');
        sessionStorage.removeItem('standbyButton_lastStandby');
        sessionStorage.setItem('baseButton_lastBase', location);
        setTimeout(displayCurrentIDs, 0);
        onConfirm(location, baseType);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
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
        // Clear other locations
        sessionStorage.removeItem('hospitalButton_lastHospital');
        sessionStorage.removeItem('baseButton_lastBase');
        sessionStorage.setItem('standbyButton_lastStandby', location);
        setTimeout(displayCurrentIDs, 0);
        onConfirm(location);
    }
    function cancelHandler() {
        cleanup();
        if (onCancel) onCancel();
    }

    confirmBtn.addEventListener("click", confirmHandler);
    cancelBtn.addEventListener("click", cancelHandler);
}
function showRefuelModal(onConfirm, onCancel) {
    const modal = document.getElementById("refuel-modal");
    const select = document.getElementById("refuel-location-select");

    // Populate refuel dropdown
    loadRefuelLocations().then(locations => {
        select.innerHTML = '<option value="" disabled selected>--Select Fuel Station--</option>';
        locations.forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc;
            opt.textContent = loc;
            select.appendChild(opt);
        });
    });

    modal.style.display = "block";
    document.body.classList.add('modal-active');

    const confirmBtn = document.getElementById("confirm-refuel-btn");
    const cancelBtn = document.getElementById("cancel-refuel-btn");

    function cleanup() {
        modal.style.display = "none";
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

function showRefuelPriceModal(location, onConfirm) {
    const modal = document.getElementById("refuel-price-modal");
    const input = document.getElementById("refuel-price-input");

    // Clear previous input and set focus
    input.value = "£";
    modal.style.display = "block";
    document.body.classList.add('modal-active');
    
    // Focus the input after a short delay to ensure modal is visible
    setTimeout(() => input.focus(), 100);

    const confirmBtn = document.getElementById("confirm-refuel-price-btn");

    function cleanup() {
        modal.style.display = "none";
        document.body.classList.remove('modal-active');
        confirmBtn.removeEventListener("click", confirmHandler);
        input.removeEventListener("keypress", keypressHandler);
    }

    async function confirmHandler() {
        const price = input.value.trim();
        if (!price || price === "£") {
            showNotification("Please enter a price.", "error");
            return;
        }
        
        // Ensure price starts with £
        const formattedPrice = price.startsWith('£') ? price : `£${price}`;
        
        cleanup();
        await onConfirm(formattedPrice);
    }

    function keypressHandler(e) {
        if (e.key === "Enter") {
            confirmHandler();
        }
    }

    confirmBtn.addEventListener("click", confirmHandler);
    input.addEventListener("keypress", keypressHandler);
}

// Location loading functions for modals
function loadHospitalLocations() {
    return fetch('../data/location.json')
        .then(response => response.json())
        .then(data => {
            return data.hospital || [];
        })
        .catch(error => {
            console.error('Error loading hospital locations:', error);
            return ['General Hospital', 'Emergency Medical Center', 'City Hospital'];
        });
}

function loadBaseLocations() {
    return fetch('../data/location.json')
        .then(response => response.json())
        .then(data => {
            return data.base || [];
        })
        .catch(error => {
            console.error('Error loading base locations:', error);
            return ['Main Base', 'Secondary Base'];
        });
}

function loadStandbyLocations() {
    return fetch('../data/location.json')
        .then(response => response.json())
        .then(data => {
            return data.standby || [];
        })
        .catch(error => {
            console.error('Error loading standby locations:', error);
            return ['Standby Point A', 'Standby Point B'];
        });
}
function loadRefuelLocations() {
    return fetch('../data/location.json')
        .then(response => response.json())
        .then(data => {
            return data['fuel-stations'] || [];
        })
        .catch(error => {
            console.error('Error loading refuel locations:', error);
            return ['Shell Station', 'BP Station', 'Texaco Station'];
        });
}

// Two-stage button logic for Hospital, Base, and Standby buttons
function setupStatusButtons() {
    // Attach click listeners to all status buttons
    const statusButtons = document.querySelectorAll('.status-buttons button');
    
    statusButtons.forEach(function(btn) {
        var status = btn.getAttribute('data-status');
        
        // Hospital button logic - two stage
        if (status === 'Transporting To Hospital') {
            btn.addEventListener('click', async function hospitalBtnHandler() {
                const currentLocation = sessionStorage.getItem('hospitalButton_lastHospital');
                const currentStatus = btn.textContent.trim();
                
                // Check if we're in stage 1 (no location selected) or stage 2 (location already selected)
                if (!currentLocation || currentStatus === 'Transporting To Hospital') {
                    // Stage 1: Show modal to select location
                    showHospitalModal(async function(location, transportType) {
                        // Clear other locations and save hospital location
                        sessionStorage.removeItem('baseButton_lastBase');
                        sessionStorage.removeItem('standbyButton_lastStandby');
                        sessionStorage.setItem('hospitalButton_lastHospital', location);
                        sessionStorage.setItem('hospitalTransportType', transportType);
                        displayCurrentIDs();
                        
                        // Set status based on transport type
                        let newStatus;
                        if (transportType === 'Standby') {
                            newStatus = `Going to Standby - ${location}`;
                        } else {
                            newStatus = `Transporting To Hospital - ${location}`;
                        }
                        
                        await updateStatusAndButton(newStatus, btn, 'At Hospital');
                        showNotification(`Selected hospital: ${location}`, 'success');
                    });
                } else {
                    // Stage 2: Use saved location, change to "At Hospital"
                    const transportType = sessionStorage.getItem('hospitalTransportType') || 'Transport';
                    let finalStatus;
                    if (transportType === 'Standby') {
                        finalStatus = `At Standby - ${currentLocation}`;
                    } else {
                        finalStatus = `At Hospital - ${currentLocation}`;
                    }
                    
                    await updateStatusAndButton(finalStatus, btn, 'Transporting To Hospital', true);
                    showNotification(`Now at hospital: ${currentLocation}`, 'success');
                }
            });
        // Standby button logic - two stage
        } else if (status === 'Go To Standby') {
            btn.addEventListener('click', async function standbyBtnHandler() {
                const currentLocation = sessionStorage.getItem('standbyButton_lastStandby');
                const currentStatus = btn.textContent.trim();
                
                // Check if we're in stage 1 (no location selected) or stage 2 (location already selected)
                if (!currentLocation || currentStatus === 'Go To Standby') {
                    // Stage 1: Show modal to select location
                    showStandbyModal(async function(location) {
                        // Clear other locations and save standby location
                        sessionStorage.removeItem('hospitalButton_lastHospital');
                        sessionStorage.removeItem('baseButton_lastBase');
                        sessionStorage.setItem('standbyButton_lastStandby', location);
                        displayCurrentIDs();
                        
                        const newStatus = `Going to Standby - ${location}`;
                        await updateStatusAndButton(newStatus, btn, 'At Standby');
                        showNotification(`Going to standby: ${location}`, 'success');
                    });
                } else {
                    // Stage 2: Use saved location, change to "At Standby"
                    const finalStatus = `At Standby - ${currentLocation}`;
                    
                    await updateStatusAndButton(finalStatus, btn, 'Go To Standby', true);
                    showNotification(`Now at standby: ${currentLocation}`, 'success');
                }
            });
        // Base button logic - two stage
        } else if (status === 'Going To Base') {
            btn.addEventListener('click', async function baseBtnHandler() {
                const currentLocation = sessionStorage.getItem('baseButton_lastBase');
                const currentStatus = btn.textContent.trim();
                
                // Check if we're in stage 1 (no location selected) or stage 2 (location already selected)
                if (!currentLocation || currentStatus === 'Going To Base') {
                    // Stage 1: Show modal to select location
                    showBaseModal(async function(location, baseType) {
                        // Clear other locations and save base location
                        sessionStorage.removeItem('hospitalButton_lastHospital');
                        sessionStorage.removeItem('standbyButton_lastStandby');
                        sessionStorage.setItem('baseButton_lastBase', location);
                        sessionStorage.setItem('baseType', baseType);
                        displayCurrentIDs();
                        
                        // Set status based on base type
                        let newStatus;
                        if (baseType === 'Standby') {
                            newStatus = `Going to Standby - ${location}`;
                        } else {
                            newStatus = `Going to replenish at base - ${location}`;
                        }
                        
                        await updateStatusAndButton(newStatus, btn, 'At Base');
                        showNotification(`Going to base: ${location}`, 'success');
                    });
                } else {
                    // Stage 2: Use saved location, change to "At Base"
                    const baseType = sessionStorage.getItem('baseType') || 'Replenishing';
                    let finalStatus;
                    if (baseType === 'Standby') {
                        finalStatus = `At Standby - ${currentLocation}`;
                    } else {
                        finalStatus = `at base - replenishing - ${currentLocation}`;
                    }
                    
                    await updateStatusAndButton(finalStatus, btn, 'Going To Base', true);
                    showNotification(`Now at base: ${currentLocation}`, 'success');
                }
            });
        // Refueling button logic - special workflow
        } else if (status === 'Refueling') {
            btn.addEventListener('click', function refuelingBtnHandler() {
                // Show refuel location modal first
                showRefuelModal(function(location) {
                    // Then show price modal
                    showRefuelPriceModal(location, async function(price) {
                        try {
                            // Save refuel log to Firebase
                            const unitId = sessionStorage.getItem('unitId');
                            const civilianName = sessionStorage.getItem('civilianName') || 'Unknown';
                            
                            if (!unitId) {
                                showNotification('No UnitID found. Cannot save refuel log.', 'error');
                                return;
                            }
                            
                            // Get unit callsign from Firebase
                            const unitSnap = await getDoc(doc(db, 'units', unitId));
                            const callsign = unitSnap.exists() ? unitSnap.data().callsign : 'Unknown';
                            
                            // Save to refuelLogs collection
                            await addDoc(collection(db, 'refuelLogs'), {
                                unitId: unitId,
                                callsign: callsign,
                                civilianName: civilianName,
                                location: location,
                                price: price,
                                timestamp: serverTimestamp()
                            });
                            
                            showNotification(`Refueling completed at ${location} for ${price}`, 'success');
                            
                            // Return to Available status
                            const availableBtn = document.querySelector('[data-status="Available"]');
                            if (availableBtn) {
                                await handleStatusChange('Available', availableBtn);
                            }
                            
                        } catch (error) {
                            console.error('Error saving refuel log:', error);
                            showNotification('Error saving refuel log', 'error');
                        }
                    });
                }, function() {
                    // Cancel callback - do nothing
                });
            });
        } else {
            // All other status buttons
            btn.addEventListener('click', async function() {
                if (status) {
                    await handleStatusChange(status, btn);
                }
            });
        }
    });
}

// Simple status change handler for all status buttons
async function handleStatusChange(status, button) {
    const unitId = sessionStorage.getItem('unitId');
    if (!unitId || unitId === 'None') {
        showNotification('No valid UnitID found. Cannot change status.', 'error');
        return;
    }
    
    try {
        // Update status in Firebase
        const unitDocRef = doc(db, "units", unitId);
        await updateDoc(unitDocRef, {
            status: status,
            lastStatusUpdate: serverTimestamp()
        });
        
        // Manage availableUnits and attachedUnit collections
        await manageUnitCollections(unitId, status);
        
        // Update status indicator and show notification
        updateStatusIndicator(status);
        animateStatusGradientBar(status);
        showNotification(`Status changed to: ${status}`, 'success');
        
        // Set this button as the active one (green for normal buttons)
        setActiveStatusButton(button, 'green');
        
        console.log(`Status changed to: ${status} for unit: ${unitId}`);
    } catch (error) {
        console.error('Error updating status in Firebase:', error);
        showNotification('Failed to update status. Please try again.', 'error');
    }
}

// Function to update status and button text for two-stage buttons
async function updateStatusAndButton(statusText, button, newButtonText, isSecondStage = false) {
    const unitId = sessionStorage.getItem('unitId');
    if (!unitId || unitId === 'None') {
        showNotification('No valid UnitID found. Cannot change status.', 'error');
        return;
    }
    
    try {
        // Update status in Firebase
        const unitDocRef = doc(db, "units", unitId);
        await updateDoc(unitDocRef, {
            status: statusText,
            lastStatusUpdate: serverTimestamp()
        });
        
        // Manage availableUnits and attachedUnit collections
        await manageUnitCollections(unitId, statusText);
        
        // Update status indicator and show notification
        updateStatusIndicator(statusText);
        animateStatusGradientBar(statusText);
        
        // Update button text
        button.textContent = newButtonText;
        
        // Set button as active with appropriate stage
        if (newButtonText === 'At Hospital' || newButtonText === 'At Base' || newButtonText === 'At Standby') {
            // Stage 1: Blue highlighting (location selected, going to location)
            setActiveStatusButton(button, 'blue');
        } else if (isSecondStage) {
            // Stage 2: Green highlighting (at location performing activity)
            setActiveStatusButton(button, 'green');
        } else {
            // Back to original state: Set as normal green active button
            setActiveStatusButton(button, 'green');
        }
        
        showNotification(`Status changed to: ${statusText}`, 'success');
        console.log(`Status changed to: ${statusText} for unit: ${unitId}`);
    } catch (error) {
        console.error('Error updating status in Firebase:', error);
        showNotification('Failed to update status. Please try again.', 'error');
    }
}

// Helper function to reset button styles to default
function resetButtonStyle(button) {
    button.style.backgroundColor = '';
    button.style.color = '';
    button.style.border = '';
    button.style.boxShadow = '';
}

// Global function to manage button selection states
function setActiveStatusButton(activeButton, stage = 'normal') {
    // Reset all status buttons to default style first
    const allStatusButtons = document.querySelectorAll('.status-buttons button');
    allStatusButtons.forEach(btn => {
        resetButtonStyle(btn);
        btn.classList.remove('active');
    });
    
    // Set the active button based on stage
    if (activeButton) {
        activeButton.classList.add('active');
        
        if (stage === 'blue') {
            // Stage 1 for special buttons: Blue highlighting
            activeButton.style.backgroundColor = '#0074d9';
            activeButton.style.color = '#fff';
            activeButton.style.border = '2px solid #0074d9';
            activeButton.style.boxShadow = '0 0 10px rgba(0, 116, 217, 0.5)';
        } else if (stage === 'green' || stage === 'normal') {
            // Stage 2 for special buttons OR normal buttons: Green highlighting
            activeButton.style.backgroundColor = '#2ecc40';
            activeButton.style.color = '#fff';
            activeButton.style.border = '2px solid #2ecc40';
            activeButton.style.boxShadow = '0 0 10px rgba(46, 204, 64, 0.5)';
        }
    }
}

// --- PANIC BUTTON LOGIC ---
function setupPanicButton() {
    const panicBtn = document.querySelector('.panic-button');
    if (!panicBtn) return;
    // Prevent multiple event listeners
    if (panicBtn.dataset.listenerAttached === 'true') return;
    panicBtn.dataset.listenerAttached = 'true';
    let panicActive = false;
    let panicDocId = null;
    let panicBlinkInterval = null;

    // Function to check if this unit has an active panic alert
    async function checkPanicState() {
        const unitId = sessionStorage.getItem('unitId');
        if (!unitId) return false;
        
        try {
            // Check for panic alert using the predictable document ID
            const panicDocRef = doc(db, 'panicAlerts', `panic_${unitId}`);
            const panicDoc = await getDoc(panicDocRef);
            
            if (panicDoc.exists()) {
                panicDocId = panicDoc.id;
                panicActive = true;
                console.log('[PANIC DEBUG] Found existing panic alert for this unit:', panicDocId);
                return true;
            } else {
                // Also check using query as fallback
                const existingPanicQuery = query(collection(db, 'panicAlerts'), where('unitId', '==', unitId));
                const existingPanicSnap = await getDocs(existingPanicQuery);
                if (!existingPanicSnap.empty) {
                    panicDocId = existingPanicSnap.docs[0].id;
                    panicActive = true;
                    console.log('[PANIC DEBUG] Found existing panic alert via query:', panicDocId);
                    return true;
                }
            }
        } catch (error) {
            console.error('[PANIC DEBUG] Error checking panic state:', error);
        }
        
        panicActive = false;
        panicDocId = null;
        return false;
    }

    async function activatePanic() {
        console.log('[PANIC DEBUG] activatePanic called. panicActive:', panicActive);
        if (panicActive) return; // Prevent double execution
        panicActive = true;
        
        // Play panic sound immediately for local user
        console.log('[PANIC DEBUG] Playing local panic sound immediately');
        console.log('[PANIC DEBUG] audioPaths loaded:', audioPathsLoaded, 'audioPaths:', audioPaths);
        console.log('[PANIC DEBUG] userHasInteracted:', userHasInteracted, 'isStartupModalActive:', isStartupModalActive);
        
        // Enhanced panic sound playing with multiple attempts
        playSoundByKey('panictones');
        
        // Additional fallback: try direct audio play as backup with a slight delay
        setTimeout(() => {
            if (audioPaths && audioPaths['panictones']) {
                console.log('[PANIC DEBUG] Fallback: playing panic sound directly');
                try {
                    const audio = new Audio(audioPaths['panictones']);
                    audio.volume = 0.8; // Ensure good volume
                    audio.play().catch(err => console.error('[PANIC DEBUG] Direct panic audio play failed:', err));
                } catch (e) {
                    console.error('[PANIC DEBUG] Direct panic audio creation failed:', e);
                }
            }
        }, 100);
        
        // Get unit info
        const unitId = sessionStorage.getItem('unitId');
        if (!unitId) {
            showNotification('No UnitID found. Cannot activate panic.', 'error');
            panicActive = false;
            return;
        }
        const unitSnap = await getDoc(doc(db, 'units', unitId));
        if (!unitSnap.exists()) {
            showNotification('Unit not found in database.', 'error');
            panicActive = false;
            return;
        }
        const unitData = unitSnap.data();
        // Find attached call (if any)
        let callLocation = null;
        let callId = null;
        const attachedSnap = await getDocs(query(collection(db, 'attachedUnit'), where('unitID', '==', unitId)));
        if (!attachedSnap.empty) {
            const callRef = attachedSnap.docs[0].data().callID;
            callId = callRef;
            const callSnap = await getDoc(doc(db, 'calls', callRef));
            if (callSnap.exists()) {
                callLocation = callSnap.data().location || null;
            }
        }
        // Prevent duplicate panic alerts for this unit
        const existingPanicQuery = query(collection(db, 'panicAlerts'), where('unitId', '==', unitId));
        const existingPanicSnap = await getDocs(existingPanicQuery);
        if (!existingPanicSnap.empty) {
            // Already exists, use the first one
            panicDocId = existingPanicSnap.docs[0].id;
            console.log('[PANIC DEBUG] Panic alert already exists for this unit, not creating duplicate.');
        } else {
            // Double-check with a more robust approach to prevent race conditions
            // Use a unique document ID based on the unit ID for atomic operations
            const panicDocRef = doc(db, 'panicAlerts', `panic_${unitId}`);
            try {
                // Check if document already exists first
                const existingDoc = await getDoc(panicDocRef);
                if (existingDoc.exists()) {
                    panicDocId = existingDoc.id;
                    console.log('[PANIC DEBUG] Panic alert already exists (found during second check), using existing one.');
                } else {
                    // Try to create the document atomically
                    await setDoc(panicDocRef, {
                        unitId,
                        callsign: unitData.callsign || 'Unknown',
                        service: unitData.unitType || 'Unknown',
                        callLocation: callLocation || null,
                        timestamp: new Date(),
                        createdBy: 'system'
                    });
                    
                    panicDocId = panicDocRef.id;
                    console.log('[PANIC DEBUG] Successfully created new panic alert for unit:', unitId);
                }
            } catch (error) {
                console.error('[PANIC DEBUG] Error creating panic alert:', error);
                // Try to get the existing document as a fallback
                try {
                    const existingDoc = await getDoc(panicDocRef);
                    if (existingDoc.exists()) {
                        panicDocId = existingDoc.id;
                        console.log('[PANIC DEBUG] Used existing panic alert after creation error.');
                    } else {
                        showNotification('Failed to create panic alert.', 'error');
                        panicActive = false;
                        return;
                    }
                } catch (getError) {
                    console.error('[PANIC DEBUG] Error getting existing document:', getError);
                    showNotification('Failed to create panic alert.', 'error');
                    panicActive = false;
                    return;
                }
            }
        }
        panicActive = true;
        console.log('[PANIC DEBUG] Panic activation completed successfully, panicDocId:', panicDocId);
        
        // Create a panic call
        await createPanicCall(unitId, unitData.callsign, callLocation);
        
        // Change status to PANIC and start blinking
        updateStatusIndicator('PANIC');
        startPanicBlink();
    }

    async function deactivatePanic() {
        console.log('[PANIC DEBUG] Deactivating panic, panicDocId:', panicDocId);
        
        const unitId = sessionStorage.getItem('unitId');
        
        // Delete the panic call first
        if (unitId) {
            await deletePanicCall(unitId);
        }
        
        if (panicDocId) {
            try {
                await deleteDoc(doc(db, 'panicAlerts', panicDocId));
                console.log('[PANIC DEBUG] Successfully deleted panic alert from Firestore');
            } catch (error) {
                console.error('[PANIC DEBUG] Error deleting panic alert:', error);
            }
        } else {
            // Fallback: try to delete using the unit-based ID format
            if (unitId) {
                try {
                    await deleteDoc(doc(db, 'panicAlerts', `panic_${unitId}`));
                    console.log('[PANIC DEBUG] Successfully deleted panic alert using unit-based ID');
                } catch (error) {
                    console.error('[PANIC DEBUG] Error deleting panic alert using unit-based ID:', error);
                }
            }
        }
        
        panicDocId = null;
        panicActive = false;
        stopPanicBlink();
        updateStatusIndicator('Unavailable');
        
        // Play tones sound immediately for local user when panic stops
        console.log('[PANIC DEBUG] Playing local tones sound for panic deactivation');
        console.log('[PANIC DEBUG] audioPaths loaded:', audioPathsLoaded, 'audioPaths:', audioPaths);
        console.log('[PANIC DEBUG] userHasInteracted:', userHasInteracted, 'isStartupModalActive:', isStartupModalActive);
        
        // Enhanced tones sound playing with multiple attempts
        playSoundByKey('tones');
        
        // Additional fallback: try direct audio play as backup with a slight delay
        setTimeout(() => {
            if (audioPaths && audioPaths['tones']) {
                console.log('[PANIC DEBUG] Fallback: playing tones sound directly');
                try {
                    const audio = new Audio(audioPaths['tones']);
                    audio.volume = 0.8; // Ensure good volume
                    audio.play().catch(err => console.error('[PANIC DEBUG] Direct tones audio play failed:', err));
                } catch (e) {
                    console.error('[PANIC DEBUG] Direct tones audio creation failed:', e);
                }
            }
        }, 100);
        
        // Do NOT call removePanicPopup() here; let the Firestore listener update the popup
    }

    function startPanicBlink() {
        const indicator = document.getElementById('current-status-indicator');
        if (!indicator) return;
        let visible = true;
        indicator.textContent = 'PANIC';
        
        // Use the universal status color system for panic
        const backgroundColor = getStatusColor('PANIC');
        const textColor = getContrastingTextColor(backgroundColor);
        indicator.style.background = backgroundColor;
        indicator.style.color = textColor;
        
        panicBlinkInterval = setInterval(() => {
            indicator.style.opacity = visible ? '1' : '0.2';
            visible = !visible;
        }, 400);
    }
    function stopPanicBlink() {
        const indicator = document.getElementById('current-status-indicator');
        if (!indicator) return;
        clearInterval(panicBlinkInterval);
        indicator.style.opacity = '1';
        indicator.textContent = 'Unavailable';
        
        // Use the universal status color system for unavailable
        const backgroundColor = getStatusColor('Unavailable');
        const textColor = getContrastingTextColor(backgroundColor);
        indicator.style.background = backgroundColor;
        indicator.style.color = textColor;
    }
    function removePanicPopup() {
        const popup = document.getElementById('panic-popup');
        if (popup) popup.remove();
        const mini = document.getElementById('panic-mini-btn');
        if (mini) mini.remove();
    }

    panicBtn.addEventListener('click', async () => {
        // Always check current state first to ensure we have the latest information
        const currentlyPanicked = await checkPanicState();
        
        console.log('[PANIC DEBUG] Panic button clicked. Current state check result:', currentlyPanicked, 'panicActive:', panicActive);
        
        if (!currentlyPanicked && !panicActive) {
            console.log('[PANIC DEBUG] Activating panic...');
            await activatePanic();
        } else {
            console.log('[PANIC DEBUG] Deactivating panic...');
            await deactivatePanic();
        }
    });

    // Initialize panic state on page load
    async function initializePanicState() {
        const currentlyPanicked = await checkPanicState();
        if (currentlyPanicked) {
            console.log('[PANIC DEBUG] Unit has active panic alert on page load, starting blink');
            updateStatusIndicator('PANIC');
            startPanicBlink();
        }
    }

    // Initialize state when the function is called
    initializePanicState();
}

// Ensure setupPanicButton is called on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPanicButton);
} else {
    setupPanicButton();
}

// --- Panic Call Management Functions ---
async function createPanicCall(unitId, callsign, location) {
    try {
        console.log('[PANIC DEBUG] Creating panic call for unit:', unitId, 'at location:', location);
        
        const callData = {
            callerName: `PANIC - ${callsign}`,
            description: `PANIC ALERT - Unit ${callsign} requires immediate assistance`,
            location: location,
            service: 'Ambulance',
            callType: 'PANIC',
            status: 'PANIC-Emergency',
            timestamp: new Date(),
            unitId: unitId,
            isPanicCall: true
        };

        const docRef = await addDoc(collection(db, "calls"), callData);
        console.log('[PANIC DEBUG] Successfully created panic call with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('[PANIC DEBUG] Error creating panic call:', error);
        throw error;
    }
}

async function deletePanicCall(unitId) {
    try {
        console.log('[PANIC DEBUG] Deleting panic call for unit:', unitId);
        
        // Query for panic calls associated with this unit
        const callsRef = collection(db, "calls");
        const q = query(callsRef, where("unitId", "==", unitId), where("isPanicCall", "==", true));
        const querySnapshot = await getDocs(q);
        
        // Delete all panic calls for this unit
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        console.log('[PANIC DEBUG] Successfully deleted', querySnapshot.docs.length, 'panic call(s) for unit:', unitId);
    } catch (error) {
        console.error('[PANIC DEBUG] Error deleting panic call:', error);
        throw error;
    }
}

async function updatePanicLocation(unitId, newLocation) {
    try {
        console.log('[PANIC DEBUG] Updating panic location for unit:', unitId, 'to:', newLocation);
        
        // Update the panic alert document
        const panicRef = doc(db, 'panicAlerts', `panic_${unitId}`);
        await updateDoc(panicRef, {
            callLocation: newLocation,
            updatedAt: new Date()
        });
        
        // Update any associated panic calls
        const callsRef = collection(db, "calls");
        const q = query(callsRef, where("unitId", "==", unitId), where("isPanicCall", "==", true));
        const querySnapshot = await getDocs(q);
        
        const updatePromises = querySnapshot.docs.map(doc => 
            updateDoc(doc.ref, { location: newLocation })
        );
        await Promise.all(updatePromises);
        
        console.log('[PANIC DEBUG] Successfully updated panic location for unit:', unitId);
        showNotification('Panic location updated successfully.', 'success');
    } catch (error) {
        console.error('[PANIC DEBUG] Error updating panic location:', error);
        showNotification('Failed to update panic location.', 'error');
        throw error;
    }
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

// --- Real-time Call Details Listener ---
let selectedCallListener = null;

// Function to set up real-time listener for selected call details
function setupSelectedCallListener(callId) {
    // Clean up existing listener
    if (selectedCallListener) {
        selectedCallListener();
        selectedCallListener = null;
    }
    
    if (!callId) return;
    
    console.log('[CALL DETAILS] Setting up real-time listener for call:', callId);
    
    // Set up real-time listener for this specific call
    const callDocRef = doc(db, 'calls', callId);
    selectedCallListener = onSnapshot(callDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const updatedCallData = { id: docSnapshot.id, ...docSnapshot.data() };
            console.log('[CALL DETAILS] Call data updated in real-time:', updatedCallData);
            
            // Update the call details section with new data
            updateCallDetailsSection(updatedCallData);
        } else {
            console.log('[CALL DETAILS] Call document no longer exists');
            // Call was deleted, clear the details section
            clearCallDetailsSection();
        }
    }, (error) => {
        console.error('[CALL DETAILS] Error in real-time listener:', error);
    });
}

// Function to update the call details section with new data
function updateCallDetailsSection(callData) {
    // Update caller name
    const callerNameElement = document.querySelector('.callerName');
    if (callerNameElement) {
        callerNameElement.textContent = callData.callerName || 'Unknown';
    }
    
    // Update incident text
    const incidentElement = document.querySelector('.incident');
    if (incidentElement) {
        incidentElement.textContent = callData.status || 'Unknown';
    }
    
    // Update location text
    const locationElement = document.querySelector('.location');
    if (locationElement) {
        locationElement.textContent = callData.location || 'Location not provided';
    }
    
    // Update description text
    const descriptionElement = document.querySelector('.descriptionText');
    if (descriptionElement) {
        if (descriptionElement.tagName === 'TEXTAREA') {
            descriptionElement.value = callData.description || '';
        } else {
            descriptionElement.textContent = callData.description || 'No description provided';
        }
    }
    
    // Update timestamp
    const timestampElement = document.querySelector('.timestamp');
    if (timestampElement && callData.timestamp) {
        const timestamp = callData.timestamp.toDate ? callData.timestamp.toDate() : new Date(callData.timestamp);
        timestampElement.textContent = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
    }
    
    // Update attached units section
    const attachedUnitsContainer = document.getElementById('attached-units-container');
    if (attachedUnitsContainer) {
        renderAttachedUnitsForSelectedCall(callData.id, attachedUnitsContainer);
    }
    
    // Update window.selectedCall with new data
    window.selectedCall = callData;
    
    console.log('[CALL DETAILS] Updated call details section with new data');
}

// Function to clear the call details section
function clearCallDetailsSection() {
    const callerNameElement = document.querySelector('.callerName');
    const incidentElement = document.querySelector('.incident');
    const locationElement = document.querySelector('.location');
    const descriptionElement = document.querySelector('.descriptionText');
    const timestampElement = document.querySelector('.timestamp');
    const attachedUnitsContainer = document.getElementById('attached-units-container');
    
    if (callerNameElement) callerNameElement.textContent = 'Unknown';
    if (incidentElement) incidentElement.textContent = 'No call selected';
    if (locationElement) locationElement.textContent = 'No location';
    if (descriptionElement) {
        if (descriptionElement.tagName === 'TEXTAREA') {
            descriptionElement.value = '';
        } else {
            descriptionElement.textContent = 'No description';
        }
    }
    if (timestampElement) timestampElement.textContent = '';
    if (attachedUnitsContainer) attachedUnitsContainer.innerHTML = '';
    
    window.selectedCall = null;
}

// Utility: Debug log all attachedUnit docs for a call
async function debugLogAttachedUnitsForCall(callId) {
    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("callID", "==", callId)
        );
        const attachedUnitSnapshot = await getDocs(attachedUnitQuery);
        if (attachedUnitSnapshot.empty) {
            console.warn('[DEBUG] [ALL attachedUnit docs for call ' + callId + '] None found.');
            return;
        }
        for (const docSnap of attachedUnitSnapshot.docs) {
            const data = docSnap.data();
            const unitID = data.unitID;
            if (!unitID) {
                console.warn('[DEBUG] [attachedUnit] Missing unitID in doc', docSnap.id, data);
                continue;
            }
            const unitRef = doc(db, "units", unitID);
            const unitSnap = await getDoc(unitRef);
            if (!unitSnap.exists()) {
                console.warn('[DEBUG] [attachedUnit] unitID ' + unitID + ' does not exist in units collection.');
            } else {
                console.log('[DEBUG] [attachedUnit] unitID ' + unitID + ' found. Unit data:', unitSnap.data());
            }
        }
    } catch (err) {
        console.error('[DEBUG] Error in debugLogAttachedUnitsForCall for callId ' + callId + ':', err);
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
    try {        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
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
                console.warn('Unit with ID ' + unitID + ' not found in units collection.');
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
            if (specificType && specificType !== 'Unknown') tooltipParts.push('(' + specificType + ')');
            if (unitService && unitService !== 'Unknown') tooltipParts.push(unitService);
            if (unitStatus && unitStatus !== 'Unknown') tooltipParts.push(unitStatus);
            const tooltip = tooltipParts.join(' ');

            var unitCardHTML =
                '<div class="unit-card" style="background-color: ' + statusColor + '; color: ' + textColor + ';" title="' + tooltip + '">' +
                    '<div class="unit-callsign">' + unitCallsign + '</div>' +
                    '<div class="unit-service-type">' + unitType + '-' + specificType + '</div>' +
                '</div>';

            unitCards.push(unitCardHTML);
            renderedUnitIds.add(unitID);
        }

        if (unitCards.length === 0) {
            container.innerHTML = '<div style="color: #999; font-size: 9px; text-align: center; padding: 6px; font-style: italic;">None</div>';
        } else {
            container.innerHTML = unitCards.join('');
        }
    } catch (error) {
        console.error('Error fetching attached units for call ID ' + callId + ':', error);
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

    try {        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
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
                console.warn('Unit with ID ' + unitID + ' not found.');
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

            unitDiv.innerHTML =
                '<div style="width: 100%; display: flex; align-items: center; justify-content: space-between;">' +
                    '<div style="display: flex; flex-direction: column; gap: 2px;">' +
                        '<span style="font-size: 16px; font-weight: bold;">' + (unitData.unitType || 'Unknown') + '</span>' +
                        '<span style="font-size: 16px; opacity: 0.9;">' + (unitData.specificType || 'Unknown') + '</span>' +
                    '</div>' +
                    '<div style="text-align: right; font-size: 16px; font-weight: bold; margin-left: 20px;">' +
                        (unitData.callsign || 'N/A') +
                    '</div>' +
                '</div>';

            container.appendChild(unitDiv);
            renderedUnitIds.add(unitID); // Mark this unit as rendered
        }

        if (renderedUnitIds.size === 0) {
            container.innerHTML = '<p style="color: #ccc; font-style: italic; text-align: center; padding: 10px;">No Attached Units</p>';
        }
    } catch (error) {
        console.error('Error fetching attached units for selected call ID ' + callId + ':', error);
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

    calls.forEach(function(call) {
        var callCard = document.createElement('div');
        callCard.classList.add('call-card');
        callCard.dataset.callId = call.id;
        var serviceColor = getUnitTypeColor(call.service);
        var serviceAbbrev = (call.service || 'SVC').substring(0, 3).toUpperCase();
        var formattedTimestamp = 'Unknown';
        if (call.timestamp) {
            var timestamp = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            var timeStr = timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            var dateStr = timestamp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
            formattedTimestamp = timeStr + '<br>' + dateStr;
        }
        var callTimeTitle = 'Unknown';
        if (call.timestamp) {
            var ts = call.timestamp.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
            callTimeTitle = ts.toLocaleString('en-GB');
        }
        callCard.innerHTML =
            '<div class="call-info">' +
                '<div class="call-service-section" style="background-color: ' + serviceColor + ';" ' +
                     'title="Service: ' + (call.service || 'Service not provided') + '">' +
                    serviceAbbrev +
                '</div>' +
                '<div class="call-status-section">' +
                    '<div class="call-status" title="Call Type: ' + (call.status || 'Awaiting Dispatch') + '">' + (call.status || 'Awaiting Dispatch') + '</div>' +
                    '<div class="caller-name" title="Caller: ' + (call.callerName || 'Unknown') + '">' + (call.callerName || 'Unknown') + '</div>' +
                    '<div class="call-location" title="Location: ' + (call.location || 'Location not provided') + '">' + (call.location || 'Location not provided') + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="call-end-section">' +
                '<div class="attached-units-section">' +
                    '<div class="attached-units-compact" id="attached-units-' + call.id + '"><!-- Placeholder for attached units --></div>' +
                '</div>' +
                '<div class="call-timestamp" title="Call Time: ' + callTimeTitle + '">' + formattedTimestamp + '</div>' +
            '</div>';

        // Attach click event listener to select the call
        callCard.addEventListener('click', function() { selectCall(call); });

        callsContainer.appendChild(callCard);

        // Render attached units for this call using the compact version (async operation)
        var attachedUnitsContainer = document.getElementById('attached-units-' + call.id);
        if (attachedUnitsContainer) {
            renderAttachedUnitsForCallCompact(call.id, attachedUnitsContainer).catch(function(error) {
                console.error('Error rendering attached units for call ' + call.id + ':', error);
            });
        }
    });

    console.log('[DEBUG] displayCalls completed, rendered', calls.length, 'call cards');
}

// Updated dispatcher count management with self-attach priority system
async function updateDispatcherCount(snapshot) {
    const counterDiv = document.getElementById('dispatcher-counter-display');
    let count = snapshot ? snapshot.size : 0;
    if (count > 0) count = count - 1;
    if (counterDiv) {
        counterDiv.textContent = `Active Dispatchers: ${count}`;
    }
    
    const selfAttachBtn = document.getElementById('self-attach-btn');
    
    if (count >= 1) {
        // Dispatcher active - priority system
        // 1. Remove self-attach lock first
       
        if (selfAttachLockActive) {
            removeAllLocks();
        }
        // 2. Apply dispatcher lock
        applyDispatcherLock();
        // 3. Hide self-attach button
        if (selfAttachBtn) {
            selfAttachBtn.style.display = 'none';
        }
    } else {
        // No dispatcher active
        // 1. Remove dispatcher lock
        if (dispatcherLockActive) {
            removeAllLocks();
        }
        // 2. Show self-attach button
        if (selfAttachBtn) {
            selfAttachBtn.style.display = '';
        }
        // 3. Check attachment status and update button/lock accordingly
        await updateSelfAttachButton();
        if (isUserAttachedToCall) {
            applySelfAttachLock();
        }
    }
}

// Function to initialize default button states
function initializeDefaultButtonStates() {
    // Set "Unavailable" as the default active button
    const unavailableButton = document.querySelector('.status-buttons button[data-status="Unavailable"]');
    if (unavailableButton) {
        setActiveStatusButton(unavailableButton, 'green');
        updateStatusIndicator('Unavailable');
    }
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

// Enhanced self-attach/detach button functionality
function setupSelfAttachButton() {
    const selfAttachBtn = document.getElementById('self-attach-btn');
    if (!selfAttachBtn) return;
    
    // Prevent multiple event listeners
    if (selfAttachBtn.dataset.listenerAttached === 'true') return;
    selfAttachBtn.dataset.listenerAttached = 'true';
    
    selfAttachBtn.addEventListener('click', async function() {
        const unitId = sessionStorage.getItem('unitId');
        
        if (!unitId || unitId === 'None') {
            showNotification('No valid UnitID found. Cannot perform attach/detach operation.', 'error');
            return;
        }
        
        // Check current attachment status
        await checkUserAttachmentStatus();
        
        if (isUserAttachedToCall) {
            // DETACH functionality
            try {
                // Find and remove attachment
                const attachedUnitQuery = query(
                    collection(db, "attachedUnit"),
                    where("unitID", "==", unitId)
                );
                const attachmentSnapshot = await getDocs(attachedUnitQuery);
                
                if (!attachmentSnapshot.empty) {
                    // Get unit details for notification
                    const unitSnap = await getDoc(doc(db, 'units', unitId));
                    const callsign = unitSnap.exists() ? unitSnap.data().callsign : 'Unknown';
                    
                    // Remove all attachment documents for this unit
                    const deletePromises = attachmentSnapshot.docs.map(doc => 
                        deleteDoc(doc.ref)
                    );
                    await Promise.all(deletePromises);
                    
                    // Update state
                    isUserAttachedToCall = false;
                    userAttachedCallId = null;
                    
                    // Remove self-attach lock and update button
                    removeAllLocks();
                    await updateSelfAttachButton();
                    
                    // Refresh attached units display
                    const attachedUnitsContainer = document.getElementById('attached-units-container');
                    if (attachedUnitsContainer && window.selectedCall) {
                        await renderAttachedUnitsForSelectedCall(window.selectedCall.id, attachedUnitsContainer);
                    }
                    
                    showNotification(`${callsign} successfully detached from call.`, 'success');
                } else {
                    showNotification('No attachment found to remove.', 'warning');
                }
            } catch (error) {
                console.error('Error detaching unit from call:', error);
                showNotification('Failed to detach from call. Please try again.', 'error');
            }
        } else {
            // ATTACH functionality
            if (!window.selectedCall || !window.selectedCall.id) {
                showNotification('No call selected. Please select a call first.', 'error');
                return;
            }
            
            try {
                // Check if unit is already attached to this specific call
                const attachedUnitQuery = query(
                    collection(db, "attachedUnit"),
                    where("callID", "==", window.selectedCall.id),
                    where("unitID", "==", unitId)
                );
                const existingAttachment = await getDocs(attachedUnitQuery);
                
                if (!existingAttachment.empty) {
                    showNotification('Unit is already attached to this call.', 'warning');
                    return;
                }
                
                // Get unit details for notification
                const unitSnap = await getDoc(doc(db, 'units', unitId));
                const callsign = unitSnap.exists() ? unitSnap.data().callsign : 'Unknown';
                
                // Attach unit to call
                await addDoc(collection(db, 'attachedUnit'), {
                    callID: window.selectedCall.id,
                    unitID: unitId,
                    timestamp: serverTimestamp()
                });
                
                // Update state
                isUserAttachedToCall = true;
                userAttachedCallId = window.selectedCall.id;
                
                // Apply self-attach lock and update button
                await updateSelfAttachButton();
                applySelfAttachLock();
                
                // Refresh attached units display
                const attachedUnitsContainer = document.getElementById('attached-units-container');
                if (attachedUnitsContainer && window.selectedCall) {
                    await renderAttachedUnitsForSelectedCall(window.selectedCall.id, attachedUnitsContainer);
                }
                
                showNotification(`${callsign} successfully attached to call.`, 'success');
                
            } catch (error) {
                console.error('Error attaching unit to call:', error);
                showNotification('Failed to attach unit to call. Please try again.', 'error');
            }
        }
    });
    
    // Initialize button state
    updateSelfAttachButton();
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
        // --- FIX: Use .value for textarea, not .textContent ---
        if (descriptionElement && descriptionElement.tagName === 'TEXTAREA') {
            descriptionElement.value = latestCall.description || '';
        } else if (descriptionElement) {
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
        setupSelectedCallListener(latestCall.id);
        
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
            console.log('AttachedUnit collection updated, checking user attachment status');
            
            // Update button state based on current attachment
            await updateSelfAttachButton();
            
            // Apply appropriate lock based on attachment status (if no dispatcher lock)
            if (!dispatcherLockActive) {
                if (isUserAttachedToCall && !selfAttachLockActive) {
                    applySelfAttachLock();
                } else if (!isUserAttachedToCall && selfAttachLockActive) {
                    removeAllLocks();
                }
            }
            
            // ...existing code for call refreshing...
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
    
    // Initialize default button states
    initializeDefaultButtonStates();
    
    // Set up panic button event listener
    setupPanicButton();

    // Set up Back to Home button event listeners
    const backButtons = document.querySelectorAll('.back-button');
    backButtons.forEach(btn => {
        btn.addEventListener('click', handleBackToHome);
    });

    // Ensure Save Details button in call details section works
    const callDetailsSaveBtn = document.querySelector('.call-details-section .save-details-btn');
    if (callDetailsSaveBtn) {
        callDetailsSaveBtn.addEventListener('click', async () => {
            // Save the description to Firestore
            const descriptionElement = document.querySelector('.descriptionText');
            let newDescription = '';
            if (descriptionElement && descriptionElement.tagName === 'TEXTAREA') {
                newDescription = descriptionElement.value;
            } else if (descriptionElement) {
                newDescription = descriptionElement.textContent;
            }
            if (window.selectedCall && window.selectedCall.id) {
                try {
                    const callDocRef = doc(db, 'calls', window.selectedCall.id);
                    await setDoc(callDocRef, { description: newDescription }, { merge: true });
                    showNotification('Call details updated successfully.', 'success');
                    // Refresh the call details UI
                    if (typeof selectCall === 'function') {
                        selectCall(window.selectedCall);
                    }
                } catch (err) {
                    showNotification('Failed to save call details to database.', 'error');
                    console.error('Error saving call description:', err);
                }
            } else {
                showNotification('No call selected. Cannot save call details.', 'error');
            }
        });
    }
});

// --- Utility: Status Indicator and Gradient Bar ---
function updateStatusIndicator(status) {
    // Update the status indicator element's text and color
    const indicator = document.getElementById('current-status-indicator');
    if (!indicator) return;
    
    indicator.textContent = status;
    
    // Use the universal status color system
    const backgroundColor = getStatusColor(status);
    const textColor = `white`; // Use white text for contrast
    
    indicator.style.background = backgroundColor;
    indicator.style.color = textColor;
}

function updateStatusGradientBar(status, flashing) {
    // Optionally update a gradient bar at the top of the page
    const bar = document.getElementById('status-gradient-bar');
    if (!bar) return;
    if (flashing) {
        bar.classList.add('flashing');
        setTimeout(() => bar.classList.remove('flashing'), 700);
    }
    // You can add more logic here to change the gradient based on status if desired
}

// --- PANIC ALERT REAL-TIME LISTENER ---
(function setupPanicAlertsListener() {
    const unitId = sessionStorage.getItem('unitId');
    console.log('[PANIC DEBUG] Current user unitId from sessionStorage:', unitId);
    const panicAlertsRef = collection(db, 'panicAlerts');
    let lastPanicDocIds = [];
    let lastSelectedTab = 0;

    onSnapshot(panicAlertsRef, (snapshot) => {
        console.log('[PANIC DEBUG] Panic alerts listener triggered, snapshot size:', snapshot.size);
        // Gather all valid panic alerts except placeholders
        const panicUnits = [];
        const currentPanicDocIds = [];
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Debug log each panic alert
            console.log('[PANIC DEBUG] Found panic alert:', data);
            // Filtering: ignore only empty, null, undefined, 'None', 'placeholder' (case-insensitive)
            if (
                data.unitId &&
                typeof data.unitId === 'string' &&
                data.unitId.trim() !== '' &&
                data.unitId.toLowerCase() !== 'none' &&
                data.unitId.toLowerCase() !== 'placeholder'
            ) {
                console.log('[PANIC DEBUG] --> PASSES FILTER, will be shown in popup');
                panicUnits.push({ ...data, docId: docSnap.id });
                currentPanicDocIds.push(docSnap.id);
            } else {
                console.log('[PANIC DEBUG] --> FILTERED OUT');
            }
        });
        
        console.log('[PANIC DEBUG] Filtered panic units:', panicUnits);
        console.log('[PANIC DEBUG] Current panic doc IDs:', currentPanicDocIds);
        console.log('[PANIC DEBUG] Last panic doc IDs:', lastPanicDocIds);
        
        // Detect new panic alerts (play panic sound for OTHER users only)
        const newPanicIds = currentPanicDocIds.filter(id => !lastPanicDocIds.includes(id));
        if (newPanicIds.length > 0) {
            console.log('[PANIC DEBUG] New panic alerts detected:', newPanicIds);
            // Check if any of the new panic alerts are from other units (not current user)
            const otherUserPanics = panicUnits.filter(unit => 
                newPanicIds.includes(unit.docId) && unit.unitId !== unitId
            );
            if (otherUserPanics.length > 0) {
                console.log('[PANIC DEBUG] Playing panic sound for other users panic alerts:', otherUserPanics);
                
                // Enhanced panic sound playing for other users' alerts
                playSoundByKey('panictones');
                
                // Additional fallback with slight delay
                setTimeout(() => {
                    if (audioPaths && audioPaths['panictones']) {
                        console.log('[PANIC DEBUG] Fallback: playing panic sound directly for other users');
                        try {
                            const audio = new Audio(audioPaths['panictones']);
                            audio.volume = 0.8;
                            audio.play().catch(err => console.error('[PANIC DEBUG] Direct panic audio play failed (other users):', err));
                        } catch (e) {
                            console.error('[PANIC DEBUG] Direct panic audio creation failed (other users):', e);
                        }
                    }
                }, 150);
            }
        }
        
        // Detect removed panic alerts (play tones sound when ALL panics are gone or when any panic is cleared)
        const removedPanicIds = lastPanicDocIds.filter(id => !currentPanicDocIds.includes(id));
        if (removedPanicIds.length > 0) {
            console.log('[PANIC DEBUG] Panic alerts removed:', removedPanicIds);
            
            // If ALL panics are now gone, play tones for everyone
            if (currentPanicDocIds.length === 0) {
                console.log('[PANIC DEBUG] All panic alerts cleared, playing tones sound');
                playSoundByKey('tones');
                
                // Enhanced tones sound playing with fallback
                setTimeout(() => {
                    if (audioPaths && audioPaths['tones']) {
                        console.log('[PANIC DEBUG] Fallback: playing tones sound directly (all panics cleared)');
                        try {
                            const audio = new Audio(audioPaths['tones']);
                            audio.volume = 0.8;
                            audio.play().catch(err => console.error('[PANIC DEBUG] Direct tones audio play failed (all cleared):', err));
                        } catch (e) {
                            console.error('[PANIC DEBUG] Direct tones audio creation failed (all cleared):', e);
                        }
                    }
                }, 100);
            } else {
                // If some panics still exist but some were cleared, also play tones
                console.log('[PANIC DEBUG] Some panic alerts cleared (but others remain), playing tones sound');
                playSoundByKey('tones');
                
                // Enhanced tones sound playing with fallback
                setTimeout(() => {
                    if (audioPaths && audioPaths['tones']) {
                        console.log('[PANIC DEBUG] Fallback: playing tones sound directly (some cleared)');
                        try {
                            const audio = new Audio(audioPaths['tones']);
                            audio.volume = 0.8;
                            audio.play().catch(err => console.error('[PANIC DEBUG] Direct tones audio play failed (some cleared):', err));
                        } catch (e) {
                            console.error('[PANIC DEBUG] Direct tones audio creation failed (some cleared):', e);
                        }
                    }
                }, 100);
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
        
        // Location with edit button (if this is the current user's unit)
        const currentUnitId = sessionStorage.getItem('unitId');
        const isCurrentUser = unit.unitId === currentUnitId;
        
        if (isCurrentUser) {
            contentHtml += '<div style="font-size:1.1rem;color:#b71c1c;display:flex;align-items:center;gap:10px;">';
            contentHtml += 'Location: <b>' + (unit.callLocation || 'Unknown') + '</b>';
            contentHtml += '<button id="panic-edit-location-btn" style="padding:4px 8px;font-size:0.85rem;background:#0074d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;" title="Edit Location">Edit</button>';
            contentHtml += '</div>';
        } else {
            contentHtml += '<div style="font-size:1.1rem;color:#b71c1c;">Location: <b>' + (unit.callLocation || 'Unknown') + '</b></div>';
        }
        
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

        // Edit location button (if present)
        const editLocationBtn = document.getElementById('panic-edit-location-btn');
        if (editLocationBtn) {
            editLocationBtn.onclick = () => {
                showPanicLocationEditModal(unit);
            };
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

// Function to close the setup modal
function closeSetupModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.style.display = 'none';
    }
    // Also try to close any other modal that might be open
    const setupModal = document.getElementById('setup-modal');
    if (setupModal) {
        setupModal.style.display = 'none';
    }
}

// Function to check if user is currently attached to any call
async function checkUserAttachmentStatus() {
    const unitId = sessionStorage.getItem('unitId');
    if (!unitId || unitId === 'None') {
        isUserAttachedToCall = false;
        userAttachedCallId = null;
        return false;
    }
    
    try {
        const attachedUnitQuery = query(
            collection(db, "attachedUnit"),
            where("unitID", "==", unitId)
        );
        const attachmentSnapshot = await getDocs(attachedUnitQuery);
        
        if (!attachmentSnapshot.empty) {
            isUserAttachedToCall = true;
            userAttachedCallId = attachmentSnapshot.docs[0].data().callID;
            return true;
        } else {
            isUserAttachedToCall = false;
            userAttachedCallId = null;
            return false;
        }
    } catch (error) {
        console.error('Error checking user attachment status:', error);
        isUserAttachedToCall = false;
        userAttachedCallId = null;
        return false;
    }
}

// Function to apply self-attach lock with distinct visual style
function applySelfAttachLock() {
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) return;
    
    selfAttachLockActive = true;
    callsContainer.style.pointerEvents = 'none';
    callsContainer.style.opacity = '0.6';
    callsContainer.style.border = '2px solid #f39c12';
    callsContainer.style.borderRadius = '8px';
    callsContainer.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
    
    // Add a lock indicator
    let lockIndicator = document.getElementById('self-attach-lock-indicator');
    if (!lockIndicator) {
        lockIndicator = document.createElement('div');
        lockIndicator.id = 'self-attach-lock-indicator';
        lockIndicator.style.position = 'absolute';
        lockIndicator.style.top = '10px';
        lockIndicator.style.right = '10px';
        lockIndicator.style.background = '#f39c12';
        lockIndicator.style.color = '#fff';
        lockIndicator.style.padding = '5px 10px';
        lockIndicator.style.borderRadius = '5px';
        lockIndicator.style.fontSize = '12px';
        lockIndicator.style.fontWeight = 'bold';
        lockIndicator.style.zIndex = '1000';
        lockIndicator.textContent = 'LOCKED: Attached to Call';
        callsContainer.style.position = 'relative';
        callsContainer.appendChild(lockIndicator);
    }
    
    showNotification('Calls list locked - You are attached to a call. Use "Self Detach" to unlock.', 'warning');
}

// Function to apply dispatcher lock with distinct visual style
function applyDispatcherLock() {
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) return;
    
    dispatcherLockActive = true;
    callsContainer.style.pointerEvents = 'none';
    callsContainer.style.opacity = '0.5';
    callsContainer.style.border = '2px solid #e74c3c';
    callsContainer.style.borderRadius = '8px';
    callsContainer.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
    
    // Add a lock indicator
    let lockIndicator = document.getElementById('dispatcher-lock-indicator');
    if (!lockIndicator) {
        lockIndicator = document.createElement('div');
        lockIndicator.id = 'dispatcher-lock-indicator';
        lockIndicator.style.position = 'absolute';
        lockIndicator.style.top = '10px';
        lockIndicator.style.right = '10px';
        lockIndicator.style.background = '#e74c3c';
        lockIndicator.style.color = '#fff';
        lockIndicator.style.padding = '5px 10px';
        lockIndicator.style.borderRadius = '5px';
        lockIndicator.style.fontSize = '12px';
        lockIndicator.style.fontWeight = 'bold';
        lockIndicator.style.zIndex = '1000';
        lockIndicator.textContent = 'LOCKED: Dispatcher Active';
        callsContainer.style.position = 'relative';
        callsContainer.appendChild(lockIndicator);
    }
    
    showNotification('Calls list locked - Active dispatcher is managing calls.', 'info');
}

// Function to remove all locks and restore normal appearance
function removeAllLocks() {
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) return;
    
    selfAttachLockActive = false;
    dispatcherLockActive = false;
    
    // Reset styles
    callsContainer.style.pointerEvents = '';
    callsContainer.style.opacity = '';
    callsContainer.style.border = '';
    callsContainer.style.borderRadius = '';
    callsContainer.style.backgroundColor = '';
    
    // Remove lock indicators
    const selfLockIndicator = document.getElementById('self-attach-lock-indicator');
    const dispatcherLockIndicator = document.getElementById('dispatcher-lock-indicator');
    if (selfLockIndicator) selfLockIndicator.remove();
    if (dispatcherLockIndicator) dispatcherLockIndicator.remove();
}

// Function to update self-attach button text and functionality
async function updateSelfAttachButton() {
    const selfAttachBtn = document.getElementById('self-attach-btn');
    if (!selfAttachBtn) return;
    
    await checkUserAttachmentStatus();
    
    if (isUserAttachedToCall) {
        selfAttachBtn.textContent = 'Self Detach';
        selfAttachBtn.style.backgroundColor = '#e74c3c';
        selfAttachBtn.style.color = '#fff';
    } else {
        selfAttachBtn.textContent = 'Self Attach';
        selfAttachBtn.style.backgroundColor = '';
        selfAttachBtn.style.color = '';
    }
}

// Function to show panic location edit modal
function showPanicLocationEditModal(unit) {
    console.log('[PANIC DEBUG] showPanicLocationEditModal called for unit:', unit);
    
    // Remove any existing panic location edit modal first
    const existingModal = document.getElementById('panic-location-edit-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create background overlay with red border
    const overlay = document.createElement('div');
    overlay.id = 'panic-location-edit-modal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        border: 3px solid #ff2222;
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
        border: 3px solid #ff2222;
        border-radius: 16px;
        padding: 28px 36px 18px 36px;
        min-width: 320px;
        max-width: 90vw;
        box-shadow: 0 8px 32px rgba(255,0,0,0.18);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        font-family: inherit;
    `;
    
    // Create title
    const title = document.createElement('div');
    title.textContent = 'Edit Panic Location';
    title.style.cssText = `
        font-size: 1.5rem;
        color: #ff2222;
        font-weight: bold;
        margin-bottom: 10px;
    `;
    
    // Create unit info
    const unitInfo = document.createElement('div');
    unitInfo.innerHTML = `<strong>Unit:</strong> ${unit.callsign || 'Unknown'}`;
    unitInfo.style.cssText = `
        font-size: 1.1rem;
        color: #b71c1c;
        margin-bottom: 15px;
    `;
    
    // Create input label
    const label = document.createElement('div');
    label.textContent = 'Current Location:';
    label.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 8px;
        align-self: flex-start;
    `;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = unit.callLocation || '';
    input.placeholder = 'Enter current location...';
    input.maxLength = 50;
    input.style.cssText = `
        width: 100%;
        padding: 12px;
        border: 2px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
        margin-bottom: 15px;
    `;
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        width: 100%;
    `;
    
    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 10px 20px;
        border: 2px solid #ccc;
        background: #fff;
        color: #666;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    `;
    
    // Create save button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Location';
    saveBtn.style.cssText = `
        padding: 10px 20px;
        border: none;
        background: #ff2222;
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    `;
    
    // Assemble modal
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    
    modal.appendChild(title);
    modal.appendChild(unitInfo);
    modal.appendChild(label);
    modal.appendChild(input);
    modal.appendChild(buttonContainer);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus the input
    setTimeout(() => input.focus(), 100);
    
    // Event handlers
    function closeModal() {
        overlay.remove();
    }
    
    // Cancel button
    cancelBtn.addEventListener('click', closeModal);
    
    // Save button
    saveBtn.addEventListener('click', async () => {
        const newLocation = input.value.trim();
        
        // Validation
        if (newLocation.length < 4) {
            showNotification('Location must be at least 4 characters long.', 'error');
            return;
        }
        
        if (newLocation.length > 50) {
            showNotification('Location cannot exceed 50 characters.', 'error');
            return;
        }
        
        // Disable buttons during save
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        saveBtn.style.background = '#999';
        
        try {
            // Use existing function for real-time updates
            await updatePanicLocation(unit.unitId, newLocation);
            closeModal(); // Auto-close on successful save
        } catch (error) {
            console.error('[PANIC DEBUG] Error saving location:', error);
            showNotification('Failed to save panic location.', 'error');
            // Re-enable buttons on error
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.textContent = 'Save Location';
            saveBtn.style.background = '#ff2222';
        }
    });
    
    // Enter key to save
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });
    
    // Click outside to cancel
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    console.log('[PANIC DEBUG] Modal created and displayed');
}

// Function to manage unit collections based on status
async function manageUnitCollections(unitId, status) {
    try {
        // Check if unit is currently attached to a call by querying the attachedUnit collection
        const attachedUnitQuery = query(collection(db, "attachedUnit"), where("unitID", "==", unitId));
        const attachedUnitSnap = await getDocs(attachedUnitQuery);
        const isAttached = !attachedUnitSnap.empty;
        
        // Check if unit is in availableUnits
        const availableUnitDocRef = doc(db, "availableUnits", unitId);
        const availableUnitSnap = await getDoc(availableUnitDocRef);
        const isAvailable = availableUnitSnap.exists();
        
        if (status === "Unavailable") {
            // Remove from both collections when unavailable
            if (isAttached) {
                // Delete all attachedUnit documents for this unit
                const attachedDocs = attachedUnitSnap.docs;
                for (const attachedDoc of attachedDocs) {
                    await deleteDoc(doc(db, "attachedUnit", attachedDoc.id));
                }
                console.log(`Removed unit ${unitId} from attachedUnit collection (status: Unavailable)`);
            }
            if (isAvailable) {
                await deleteDoc(availableUnitDocRef);
                console.log(`Removed unit ${unitId} from availableUnits collection (status: Unavailable)`);
            }
        } else {
            // For any other status, ensure unit is in availableUnits ONLY if not attached
            if (!isAttached && !isAvailable) {
                // Add to availableUnits (only store unitId, other details are in units collection)
                await setDoc(availableUnitDocRef, {
                    unitId: unitId
                });
                console.log(`Added unit ${unitId} to availableUnits collection (status: ${status})`);
            } else if (isAttached && isAvailable) {
                // If unit is attached to a call, remove it from availableUnits
                await deleteDoc(availableUnitDocRef);
                console.log(`Removed unit ${unitId} from availableUnits collection (unit is attached to call)`);
            }
        }
        
    } catch (error) {
        console.error('Error managing unit collections:', error);
        // Don't throw error to avoid breaking the status update flow
    }
}
