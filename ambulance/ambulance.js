import { db } from "../firebase/firebase.js";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getUnitTypeColor } from "../dispatch/statusColor.js"; // Correctly import the function

let liveUnitId = null; // Store the unique ID of the live unit
let liveCharacterId = null; // Store the unique ID of the live character

// Function to initialize the modal with fade and dropdown functionality
function initializeModal() {
    const setupModal = document.getElementById("setup-modal");

    if (setupModal) {
        // Display the modal
        setupModal.style.display = "flex";

        // Add the overlay to fade the background
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay active";
        overlay.id = "modal-overlay";
        document.body.appendChild(overlay);

        // Disable scrolling and interaction with the background
        document.body.classList.add("no-scroll");

        // Close modal on overlay click
        overlay.addEventListener("click", () => {
            closeModal();
        });
    }
}

// Function to close the modal and restore interaction
function closeModal() {
    const setupModal = document.getElementById("setup-modal");
    if (setupModal) {
        setupModal.style.display = "none";
    }

    const overlay = document.getElementById("modal-overlay");
    if (overlay) {
        overlay.remove();
    }

    document.body.classList.remove("no-scroll");
}

// Function to populate character slots dynamically
function populateCharacterSlots() {
    const slotSelect = document.getElementById("slot-select");
    if (!slotSelect) return;

    slotSelect.innerHTML = ""; // Clear existing options

    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "--Select--";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    slotSelect.appendChild(defaultOption);

    // Loop through the character slots
    Object.keys(globalCharacters).forEach((key, index) => {
        const characterData = globalCharacters[key];
        const option = document.createElement("option");
        option.value = key;

        if (characterData) {
            option.textContent = `Character ${index + 1}: ${characterData.firstName || "Unknown"} ${characterData.lastName || ""}`;
        } else {
            option.textContent = `Character ${index + 1} (Empty)`;
        }

        slotSelect.appendChild(option);
    });
}

// Attach event listener to load character button
document.addEventListener("DOMContentLoaded", () => {
    const loadCharacterButton = document.getElementById("load-character-btn");
    if (loadCharacterButton) {
        loadCharacterButton.addEventListener("click", () => {
            const slotSelect = document.getElementById("slot-select");
            const selectedSlot = slotSelect.value;

            if (!selectedSlot) {
                alert("Please select a slot.");
                return;
            }

            loadCharacterFromSlot(selectedSlot);
        });
    }
});

// Cleanup stale data on page load and initialize modal
document.addEventListener("DOMContentLoaded", async () => {
    await cleanupOnLoad();
    initializeModal();
    populateCharacterSlots();
});

// Function to remove references to the unit
async function removeUnitReferences(unitId) {
    try {
        if (unitId) {
            await deleteDoc(doc(db, "units", unitId));

            // Remove references in "attachedUnits" and "availableUnits"
            const attachedUnitsQuery = query(collection(db, "attachedUnits"), where("unitId", "==", unitId));
            const attachedUnitsSnapshot = await getDocs(attachedUnitsQuery);
            attachedUnitsSnapshot.forEach(async (docRef) => {
                await deleteDoc(doc(db, "attachedUnits", docRef.id));
            });

            const availableUnitsQuery = query(collection(db, "availableUnits"), where("unitId", "==", unitId));
            const availableUnitsSnapshot = await getDocs(availableUnitsQuery);
            availableUnitsSnapshot.forEach(async (docRef) => {
                await deleteDoc(doc(db, "availableUnits", docRef.id));
            });
        }
    } catch (error) {
        console.error("Error removing unit references:", error);
    }
}

// Function to remove the live unit and character
async function cleanupOnLoad() {
    const storedUnitId = localStorage.getItem("liveUnitId");
    const storedCharacterId = localStorage.getItem("liveCharacterId");

    try {
        if (storedUnitId) {
            await removeUnitReferences(storedUnitId);
            localStorage.removeItem("liveUnitId");
        }

        if (storedCharacterId) {
            await deleteDoc(doc(db, "civilians", storedCharacterId));
            localStorage.removeItem("liveCharacterId");
        }
    } catch (error) {
        console.error("Error during cleanup on load:", error);
    }
}

// Function to save the live unit and character IDs to local storage
function saveLiveIdsToLocalStorage() {
    if (liveUnitId) {
        localStorage.setItem("liveUnitId", liveUnitId);
    }
    if (liveCharacterId) {
        localStorage.setItem("liveCharacterId", liveCharacterId);
    }
}

// Attach event listener for page unload
window.addEventListener("beforeunload", () => {
    saveLiveIdsToLocalStorage();
});

// Function to load a character from the selected slot
function loadCharacterFromSlot(slot) {
    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const characterData = globalCharacters[slot];

    if (characterData) {
        const firstNameInput = document.getElementById("first-name");
        const lastNameInput = document.getElementById("last-name");
        const dobInput = document.getElementById("dob");
        const phoneInput = document.getElementById("phone");
        const ageInput = document.getElementById("age");
        const profilePicture = document.getElementById("profile-picture");

        // Ensure all elements exist before setting their values
        if (firstNameInput) firstNameInput.value = characterData.firstName || "";
        if (lastNameInput) lastNameInput.value = characterData.lastName || "";
        if (dobInput) dobInput.value = characterData.dob || "";
        if (phoneInput) phoneInput.value = characterData.phone || "";

        // Update the age field
        if (dobInput && ageInput) {
            if (characterData.dob) {
                const age = calculateAge(characterData.dob);
                ageInput.value = age >= 0 ? age : ""; // Ensure age is not negative
            } else {
                ageInput.value = ""; // Clear the age field if no DOB is provided
            }
        }

        // Load the profile picture
        if (profilePicture) {
            profilePicture.src = characterData.profilePicture || "../imgs/blank-profile-picture-973460.svg";
        }

        // Store the address in a hidden field for saving later
        const addressInput = document.getElementById("address");
        if (addressInput) {
            addressInput.value = characterData.address || "";
        }
    } else {
        alert(`Slot ${slot} is empty or invalid.`);
    }
}

function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    // Adjust age if the current date is before the birth date in the current year
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
        alert("Please enter a callsign and specific type.");
        return false; // Indicate failure
    }

    if (!firstName || !lastName) {
        alert("Please load a character before saving details.");
        return false; // Indicate failure
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
        liveUnitId = unitDocRef.id; // Store the unique ID of the live unit

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
        liveCharacterId = civilianDocRef.id; // Store the unique ID of the live character

        // Display the saved callsign on the main page
        const callsignDisplay = document.getElementById("callsign-display");
        callsignDisplay.textContent = `Saved Callsign: ${callsignInput}`;

        // Populate the calls list
        await populateCallsList();
        return true; // Indicate success
    } catch (error) {
        console.error("Error saving details:", error);

        // Cleanup any partially added data
        if (liveUnitId) {
            await deleteDoc(doc(db, "units", liveUnitId));
            liveUnitId = null;
        }

        if (liveCharacterId) {
            await deleteDoc(doc(db, "civilians", liveCharacterId));
            liveCharacterId = null;
        }

        alert("Failed to save details. Please try again.");
        return false; // Indicate failure
    }
}

// Attach event listener to the "Save Details" button to close the modal only on success
document.addEventListener("DOMContentLoaded", () => {
    const saveDetailsButton = document.getElementById("save-details-btn");
    if (saveDetailsButton) {
        saveDetailsButton.addEventListener("click", async () => {
            const success = await saveDetails();
            if (success) {
                await closeModal(); // Close the modal only if saveDetails succeeds
            }
        });
    }
});

// Function to populate the calls list
async function populateCallsList() {
    const callsContainer = document.getElementById("calls-container");
    if (!callsContainer) return;

    callsContainer.innerHTML = ""; // Clear existing calls

    try {
        const querySnapshot = await getDocs(collection(db, "calls"));
        querySnapshot.forEach((doc) => {
            const callData = doc.data();

            // Filter calls for "Ambulance" or "Multiple" services
            if (callData.service === "Ambulance" || callData.service === "Multiple") {
                const callElement = document.createElement("div");
                callElement.className = "call-item";

                // Add a colored service label
                const serviceLabel = document.createElement("div");
                serviceLabel.className = "service";
                serviceLabel.textContent = callData.service;
                serviceLabel.style.backgroundColor = getUnitTypeColor(callData.service);
                serviceLabel.style.color = getContrastingTextColor(serviceLabel.style.backgroundColor);

                // Add other call details
                const nameElement = document.createElement("div");
                nameElement.className = "name";
                nameElement.textContent = `Status: ${callData.status}`;

                const locationElement = document.createElement("div");
                locationElement.className = "location";
                locationElement.textContent = `Location: ${callData.location || "Unknown"}`;

                const descriptionElement = document.createElement("div");
                descriptionElement.className = "description";
                descriptionElement.textContent = callData.description || "No description provided.";

                const timestampElement = document.createElement("div");
                timestampElement.className = "timestamp";
                const date = new Date(callData.timestamp.seconds * 1000); // Convert Firestore timestamp to JavaScript Date
                timestampElement.textContent = `Timestamp: ${date.toLocaleString()}`;

                // Append elements to the call item
                callElement.appendChild(timestampElement);
                callElement.appendChild(serviceLabel);
                callElement.appendChild(locationElement);
                callElement.appendChild(nameElement);
                callElement.appendChild(descriptionElement);

                // Add click event listener to populate "Call Details" and highlight the selected call
                callElement.addEventListener("click", () => {
                    // Remove highlight from previously selected call
                    const previouslySelected = document.querySelector(".call-item.selected");
                    if (previouslySelected) {
                        previouslySelected.classList.remove("selected");
                    }

                    // Highlight the selected call
                    callElement.classList.add("selected");

                    // Populate the "Call Details" section
                    document.querySelector(".incident").textContent = `Incident: ${callData.incident || "Unknown"}`;
                    document.querySelector(".location").textContent = `Location: ${callData.location || "Unknown"}`;
                    document.querySelector(".callerName").textContent = callData.callerName || "Unknown";
                    document.querySelector(".descriptionText").textContent = callData.description || "No description provided.";
                    document.querySelector(".timestamp").textContent = `Time Stamp: ${date.toLocaleString()}`;

                    // Populate attached units if available
                    const attachedUnitsContainer = document.getElementById("attached-units-container");
                    attachedUnitsContainer.innerHTML = ""; // Clear existing units
                    if (callData.attachedUnits && callData.attachedUnits.length > 0) {
                        callData.attachedUnits.forEach((unit) => {
                            const unitElement = document.createElement("div");
                            unitElement.textContent = unit;
                            attachedUnitsContainer.appendChild(unitElement);
                        });
                    } else {
                        attachedUnitsContainer.textContent = "No units attached.";
                    }
                });

                // Append the call item to the container
                callsContainer.appendChild(callElement);
            }
        });
    } catch (error) {
        console.error("Error fetching calls:", error);
    }
}

// Event listener for "Back To Home" button
document.querySelector(".back-button").addEventListener("click", async () => {
    await cleanupOnExit();
    window.location.href = "../index.html";
});
