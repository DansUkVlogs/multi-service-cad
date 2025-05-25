import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, getDoc, collection, addDoc, updateDoc, getDocs, setDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStatusColor, getContrastingTextColor } from "../dispatch/statusColor.js";

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

// Function to play a sound
function playSound(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play();
}

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

        // Display the saved callsign on the main page
        const callsignDisplay = document.getElementById("callsign-display");
        callsignDisplay.textContent = `Saved Callsign: ${callsignInput}`;

        showNotification("Details saved successfully!", "success");

        // Close the modal after saving details
        closeSetupModal();
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
        playSound(audioPaths.statuschange);

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

// Utility to open/close modal and overlay, and prevent background interaction
function openSetupModal() {
    document.getElementById('setup-modal').classList.add('active');
    document.getElementById('modal-overlay').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeSetupModal() {
    document.getElementById('setup-modal').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.classList.remove('modal-open');
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

    const confirmBtn = document.getElementById("confirm-hospital-btn");
    const cancelBtn = document.getElementById("cancel-hospital-btn");

    function cleanup() {
        modal.style.display = "none";
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

    const confirmBtn = document.getElementById("confirm-base-btn");
    const cancelBtn = document.getElementById("cancel-base-btn");

    function cleanup() {
        modal.style.display = "none";
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

    const confirmBtn = document.getElementById("confirm-standby-btn");
    const cancelBtn = document.getElementById("cancel-standby-btn");

    function cleanup() {
        modal.style.display = "none";
        modal.classList.remove("active");
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

    const confirmBtn = document.getElementById("confirm-refuel-btn");
    const cancelBtn = document.getElementById("cancel-refuel-btn");

    function cleanup() {
        modal.style.display = "none";
        modal.classList.remove("active");
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
}

// --- Dispatcher Counter and Calls List Logic ---
document.addEventListener("DOMContentLoaded", () => {
    // Add dispatcher counter display above calls list
    const callsListDiv = document.querySelector('.calls-list');
    if (callsListDiv && !document.getElementById('dispatcher-counter-display')) {
        const counterDiv = document.createElement('div');
        counterDiv.id = 'dispatcher-counter-display';
        counterDiv.style = 'margin-bottom: 10px; font-weight: bold; color: #0288D1;';
        callsListDiv.insertBefore(counterDiv, callsListDiv.firstChild);
    }

    // Add message for why calls are hidden
    if (callsListDiv && !document.getElementById('calls-hidden-message')) {
        const msgDiv = document.createElement('div');
        msgDiv.id = 'calls-hidden-message';
        msgDiv.style = 'margin: 12px 0; color: #b71c1c; font-weight: bold; display: none;';
        callsListDiv.insertBefore(msgDiv, callsListDiv.children[1]);
    }

    // Real-time dispatcher count and calls logic
    const dispatchersRef = collection(db, 'dispatchers');
    let unsubscribeCalls = null;

    onSnapshot(dispatchersRef, (snapshot) => {
        console.log('Started checking for active dispatchers.'); // Log when checking starts
        // Exclude placeholder documents from the count
        const realDispatchers = snapshot.docs.filter(docSnap => !docSnap.data().placeholder);
        const dispatcherCount = realDispatchers.length;
        const counterDiv = document.getElementById('dispatcher-counter-display');
        const msgDiv = document.getElementById('calls-hidden-message');
        const callsContainer = document.getElementById('calls-container');
        if (counterDiv) {
            counterDiv.textContent = `Active Dispatchers: ${dispatcherCount}`;
        }
        if (dispatcherCount > 0) {
            // Hide calls, show message
            if (callsContainer) callsContainer.innerHTML = '';
            if (msgDiv) {
                msgDiv.textContent = 'No ambulance calls are being shown because a dispatcher is active.';
                msgDiv.style.display = '';
            }
            if (unsubscribeCalls) unsubscribeCalls();
        } else {
            // Show ambulance/multiple calls, hide message
            if (msgDiv) msgDiv.style.display = 'none';
            // Listen for ambulance/multiple calls in real-time
            if (unsubscribeCalls) unsubscribeCalls();
            const callsRef = collection(db, 'calls');
            const q = query(callsRef, where('service', 'in', ['ambulance', 'multiple']));
            unsubscribeCalls = onSnapshot(q, (snapshot) => {
                console.log('Snapshot received:', snapshot.docs.map(doc => doc.data())); // Log the raw snapshot data
                const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                displayCalls(calls);
            });
        }
    });

    // Initial population of calls
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('service', 'in', ['ambulance', 'multiple']));
    getDocs(q).then(snapshot => {
        console.log('Initial snapshot received:', snapshot.docs.map(doc => doc.data())); // Log the raw snapshot data
        const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayCalls(calls);
    });
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

        callsContainer.appendChild(callCard);
    });
}

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

// Remove any import of audio-paths.json
// import audioPaths from './audio-paths.json' assert { type: 'json' };

// Instead, use fetch to load the JSON:
let audioPaths = {};
fetch('../data/audio-paths.json')
  .then(response => response.json())
  .then(data => {
    audioPaths = data;
    // ...any code that depends on audioPaths should go here or after this block...
  })
  .catch(err => {
    console.error('Failed to load audio-paths.json:', err);
  });

// Optionally, listen for online/offline events to notify user
window.addEventListener('offline', () => {
    showNotification("You have lost internet connection.", "error");
});
window.addEventListener('online', () => {
    showNotification("Internet connection restored.", "success");
});

// Add this CSS to your stylesheet for the flashing effect:
// .flashing { animation: flash 0.5s alternate 4; }
// @keyframes flash { from { background: #fff700; } to { background: #fff; } }

// On page load, fetch the current status from the database and update the indicator
async function setInitialStatusIndicator() {
    const unitId = sessionStorage.getItem("unitId");
    if (!unitId || unitId === "None") return;
    try {
        const unitDoc = await getDoc(doc(db, "units", unitId));
        if (unitDoc.exists()) {
            const status = unitDoc.data().status || "Unavailable";
            updateStatusIndicator(status);
        }
    } catch (e) {
        // Fallback: set to Unavailable
        updateStatusIndicator("Unavailable");
    }
}
