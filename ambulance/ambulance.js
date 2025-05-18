import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, deleteDoc, getDoc, collection, addDoc, updateDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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
        console.error(`Error deleting unit ID=${unitId}:`, error);
        showNotification(`Error deleting unit ID=${unitId}. Check console for details.`, "error");
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
        console.error(`Error deleting civilian ID=${civilianId}:`, error);
        showNotification(`Error deleting civilian ID=${civilianId}. Check console for details.`, "error");
    }
}

// Function to remove unit and character from database and return a message
async function removeUnitandCharacter() {
    const civilianIdElement = document.getElementById("civilian-id-display");
    const unitIdElement = document.getElementById("unit-id-display");

    const civilianId = civilianIdElement.textContent.replace("Current CivilianID: ", "").trim();
    const unitId = unitIdElement.textContent.replace("Current UnitID: ", "").trim();

    let alertMessage = "";

    // Remove civilian
    if (civilianId && civilianId !== "None") {
        try {
            const civilianDoc = await getDoc(doc(db, "civilians", civilianId));
            if (civilianDoc.exists()) {
                await deleteDoc(doc(db, "civilians", civilianId));
                alertMessage += `Successfully deleted Civilian: ID=${civilianId}\n`;
            } else {
                alertMessage += `Civilian with ID=${civilianId} does not exist.\n`;
            }
        } catch (error) {
            console.error(`Error deleting civilian ID=${civilianId}:`, error);
            alertMessage += `Error deleting Civilian: ID=${civilianId}. Check console for details.\n`;
        }
    } else {
        alertMessage += "No valid CivilianID to delete.\n";
    }

    // Remove unit and all references in attachedUnit and availableUnits
    if (unitId && unitId !== "None") {
        try {
            // Remove the main unit document
            const unitDoc = await getDoc(doc(db, "units", unitId));
            if (unitDoc.exists()) {
                await deleteDoc(doc(db, "units", unitId));
                alertMessage += `Successfully deleted Unit: ID=${unitId}\n`;
            } else {
                alertMessage += `Unit with ID=${unitId} does not exist.\n`;
            }

            // Remove from attachedUnit collection where unitID matches
            const attachedUnitsQuery = await getDocs(collection(db, "attachedUnit"));
            let attachedRemoved = 0;
            for (const docSnap of attachedUnitsQuery.docs) {
                const data = docSnap.data();
                if (data.unitID === unitId) {
                    await deleteDoc(doc(db, "attachedUnit", docSnap.id));
                    attachedRemoved++;
                }
            }
            if (attachedRemoved > 0) {
                alertMessage += `Removed ${attachedRemoved} attachedUnit(s) with unitID=${unitId}\n`;
            }

            // Remove from availableUnits collection where unitId matches
            const availableUnitsQuery = await getDocs(collection(db, "availableUnits"));
            let availableRemoved = 0;
            for (const docSnap of availableUnitsQuery.docs) {
                const data = docSnap.data();
                if (data.unitId === unitId) {
                    await deleteDoc(doc(db, "availableUnits", docSnap.id));
                    availableRemoved++;
                }
            }
            if (availableRemoved > 0) {
                alertMessage += `Removed ${availableRemoved} availableUnit(s) with unitId=${unitId}\n`;
            }

        } catch (error) {
            console.error(`Error deleting unit ID=${unitId}:`, error);
            alertMessage += `Error deleting Unit: ID=${unitId}. Check console for details.\n`;
        }
    } else {
        alertMessage += "No valid UnitID to delete.\n";
    }

    return alertMessage;
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
        console.error("Error saving details:", error);
        showNotification("Failed to save details. Please try again.", "error");
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
    } catch (error) {
        console.error(`Error updating status to ${status}:`, error);
        showNotification(`Failed to change status to: ${status}. Check console for details.`, "error");
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
    // Attempt to remove any leftover unit/civilian from previous session
    const civilianId = sessionStorage.getItem("civilianId");
    const unitId = sessionStorage.getItem("unitId");
    if (civilianId && civilianId !== "None") {
        try {
            const civilianDoc = await getDoc(doc(db, "civilians", civilianId));
            if (civilianDoc.exists()) {
                await deleteDoc(doc(db, "civilians", civilianId));
                console.log(`Cleaned up orphaned Civilian: ID=${civilianId}`);
            }
        } catch (e) {
            console.warn(`Cleanup failed for Civilian: ID=${civilianId}`, e);
        }
        sessionStorage.removeItem("civilianId");
    }
    if (unitId && unitId !== "None") {
        try {
            const unitDoc = await getDoc(doc(db, "units", unitId));
            if (unitDoc.exists()) {
                await deleteDoc(doc(db, "units", unitId));
                console.log(`Cleaned up orphaned Unit: ID=${unitId}`);
            }
        } catch (e) {
            console.warn(`Cleanup failed for Unit: ID=${unitId}`, e);
        }
        sessionStorage.removeItem("unitId");
    }

    // Modal setup
    populateCharacterSlots();
    openSetupModal();
    document.getElementById('modal-overlay').addEventListener('click', closeSetupModal);
    const modalBackBtn = document.getElementById('modal-back-home');
    if (modalBackBtn) modalBackBtn.addEventListener('click', handleBackToHome);
    const headerBackBtn = document.querySelector('.header .back-button');
    if (headerBackBtn) headerBackBtn.addEventListener('click', handleBackToHome);
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
        "On Duty"
    ];

    document.querySelectorAll(".status-buttons button").forEach((btn) => {
        const status = btn.getAttribute("data-status");
        if (statusButtons.includes(status)) {
            btn.addEventListener("click", async () => {
                const unitId = sessionStorage.getItem("unitId");
                if (!unitId || unitId === "None") {
                    showNotification("No valid UnitID found. Cannot change status.", "error");
                    return;
                }
                try {
                    if (status === "On Duty") {
                        // Toggle between On Duty and Off Duty
                        if (btn.textContent === "On Duty") {
                            btn.textContent = "Off Duty";
                            await deleteDoc(doc(db, "units", unitId));
                            const availableUnitsQuery = await getDocs(collection(db, "availableUnits"));
                            availableUnitsQuery.forEach(async (docSnap) => {
                                const data = docSnap.data();
                                if (data.unitId === unitId) {
                                    await deleteDoc(doc(db, "availableUnits", docSnap.id));
                                }
                            });
                            const attachedUnitsQuery = await getDocs(collection(db, "attachedUnit"));
                            attachedUnitsQuery.forEach(async (docSnap) => {
                                const data = docSnap.data();
                                if (data.unitID === unitId) {
                                    await deleteDoc(doc(db, "attachedUnit", docSnap.id));
                                }
                            });
                            // Play statuschange sound
                            if (audioPaths.statuschange) playSound(audioPaths.statuschange);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            btn.classList.add("selected-status");
                            showNotification("Unit set to Off Duty and removed from system.", "success");
                        } else {
                            const callsign = document.getElementById("callsign-input").value.trim();
                            const specificType = document.getElementById("specific-type").value.trim();
                            const unitType = document.getElementById("unit-type").value.trim() || "Ambulance";
                            if (!callsign || !specificType) {
                                showNotification("Cannot go On Duty: Callsign or Specific Type missing.", "error");
                                return;
                            }
                            await setDoc(doc(db, "units", unitId), {
                                callsign,
                                specificType,
                                status: "Unavailable",
                                unitType,
                                timestamp: new Date()
                            });
                            btn.textContent = "On Duty";
                            // Play statuschange sound
                            if (audioPaths.statuschange) playSound(audioPaths.statuschange);
                            document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                            const unavailableBtn = document.querySelector('.status-buttons button[data-status="Unavailable"]');
                            if (unavailableBtn) unavailableBtn.classList.add("selected-status");
                            showNotification("Unit set to On Duty and status set to Unavailable.", "success");
                        }
                        return;
                    }

                    await updateDoc(doc(db, "units", unitId), { status });
                    if (status === "Available") {
                        const availableUnitsQuery = await getDocs(collection(db, "availableUnits"));
                        let alreadyExists = false;
                        availableUnitsQuery.forEach((docSnap) => {
                            const data = docSnap.data();
                            if (data.unitId === unitId) {
                                alreadyExists = true;
                            }
                        });
                        if (!alreadyExists) {
                            await addDoc(collection(db, "availableUnits"), { unitId });
                        }
                    }
                    // Play statuschange sound
                    if (audioPaths.statuschange) playSound(audioPaths.statuschange);
                    document.querySelectorAll(".status-buttons button").forEach(b => b.classList.remove("selected-status"));
                    btn.classList.add("selected-status");
                    showNotification(`Status changed to: ${status}`, "success");
                } catch (e) {
                    showNotification("Failed to update status.", "error");
                }
            });
        }
    });

    // Close modal when overlay is clicked
    document.getElementById('modal-overlay').addEventListener('click', closeSetupModal);
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
