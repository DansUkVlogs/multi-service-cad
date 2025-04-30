import { db } from "../firebase/firebase.js";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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

// Function to get contrasting text color (for readability)
function getContrastingTextColor(backgroundColor) {
    const color = backgroundColor.charAt(0) === '#' ? backgroundColor.slice(1) : backgroundColor;
    const rgb = parseInt(color, 16); // Convert hex to rgb
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
  
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return brightness > 128 ? "#FFFFFF" : "#000000"; // Return black or white text
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
            const attachedUnitsQuery = query(collection(db, "attachedUnits"), where("unitID", "==", unitId));
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

// Function to get the background color for a service
function getServiceColor(service) {
    switch (service) {
        case 'Ambulance':
            return '#2196F3'; // Blue for Ambulance
        case 'Multiple':
            return '#FFC107'; // Yellow for Multiple
        default:
            return '#9E9E9E'; // Gray for unknown services
    }
}

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
                callElement.dataset.callId = doc.id; // Store the call ID in a data attribute

                // Add service box
                const serviceBox = document.createElement("div");
                serviceBox.className = "service-box";
                serviceBox.textContent = `Service: ${callData.service}`;
                serviceBox.style.backgroundColor = getServiceColor(callData.service);
                serviceBox.style.color = "#FFFFFF"; // Ensure text is readable

                // Add status
                const statusElement = document.createElement("div");
                statusElement.className = "status";
                statusElement.textContent = `Incident: ${callData.status || "Unknown"}`;

                // Add caller name with label
                const nameElement = document.createElement("div");
                nameElement.className = "name";
                nameElement.textContent = `Caller Name: ${callData.callerName || "Unknown"}`;

                // Add location with label
                const locationElement = document.createElement("div");
                locationElement.className = "location";
                locationElement.textContent = `Location: ${callData.location || "Unknown"}`;

                // Add timestamp
                const timestampElement = document.createElement("div");
                timestampElement.className = "timestamp";
                const date = new Date(callData.timestamp.seconds * 1000); // Convert Firestore timestamp to JavaScript Date
                timestampElement.textContent = `Time: ${date.toLocaleTimeString()} ${date.toLocaleDateString()}`;

                // Append elements to the call item
                callElement.appendChild(serviceBox);
                callElement.appendChild(statusElement);
                callElement.appendChild(nameElement);
                callElement.appendChild(locationElement);
                callElement.appendChild(timestampElement);

                // Add click event listener to populate "Call Details" and attached units
                callElement.addEventListener("click", () => {
                    // Remove highlight from previously selected call
                    const previouslySelected = document.querySelector(".call-item.selected");
                    if (previouslySelected) {
                        previouslySelected.classList.remove("selected");
                    }

                    // Highlight the selected call
                    callElement.classList.add("selected");

                    // Populate the "Call Details" section
                    document.querySelector(".incident").textContent = `Incident: ${callData.status || "Unknown"}`;
                    document.querySelector(".location").textContent = `Location: ${callData.location || "Unknown"}`;
                    document.querySelector(".callerName").textContent = callData.callerName || "Unknown";
                    document.querySelector(".descriptionText").textContent = callData.description || "No description provided.";
                    document.querySelector(".timestamp").textContent = `Time Stamp: ${date.toLocaleString()}`;

                    // Populate attached units
                    populateAttachedUnits(doc.id);
                });

                // Append the call item to the container
                callsContainer.appendChild(callElement);
            }
        });
    } catch (error) {
        console.error("Error fetching calls:", error);
    }
}

// Function to update the "Call Details" section dynamically
function updateCallDetails(callId) {
    const callDocRef = doc(db, "calls", callId);

    // Fetch the latest call details
    getDoc(callDocRef).then((callDoc) => {
        if (callDoc.exists()) {
            const callData = callDoc.data();
            const date = new Date(callData.timestamp.seconds * 1000); // Convert Firestore timestamp to JavaScript Date

            // Update the "Call Details" section
            document.querySelector(".incident").textContent = `Incident: ${callData.status || "Unknown"}`;
            document.querySelector(".location").textContent = `Location: ${callData.location || "Unknown"}`;
            document.querySelector(".callerName").textContent = callData.callerName || "Unknown";
            document.querySelector(".descriptionText").textContent = callData.description || "No description provided.";
            document.querySelector(".timestamp").textContent = `Time Stamp: ${date.toLocaleString()}`;
        }
    }).catch((error) => {
        console.error("Error fetching call details:", error);
    });

    // Update the attached units dynamically
    populateAttachedUnits(callId);
}

// Listen for real-time updates to the `calls` collection
onSnapshot(collection(db, "calls"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "modified" || change.type === "added") {
            const selectedCallId = document.querySelector(".call-item.selected")?.dataset.callId;

            // If the updated call is the currently selected call, update the details
            if (selectedCallId === change.doc.id) {
                updateCallDetails(change.doc.id);
            }
        }
    });
});

// Listen for real-time updates to the `attachedUnits` collection
onSnapshot(collection(db, "attachedUnits"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const selectedCallId = document.querySelector(".call-item.selected")?.dataset.callId;

        // If the change affects the currently selected call, update the attached units
        if (selectedCallId && (change.type === "added" || change.type === "modified" || change.type === "removed")) {
            populateAttachedUnits(selectedCallId);
        }
    });
});

// Function to populate attached units dynamically
async function populateAttachedUnits(callId) {
    const attachedUnitsContainer = document.getElementById("attached-units-container");
    attachedUnitsContainer.innerHTML = ""; // Clear existing units

    try {
        // Query attachedUnits collection for units with the matching callID
        const attachedUnitsQuery = query(collection(db, "attachedUnits"), where("callID", "==", callId));
        const attachedUnitsSnapshot = await getDocs(attachedUnitsQuery);

        if (attachedUnitsSnapshot.empty) {
            attachedUnitsContainer.textContent = "No units attached.";
            return;
        }

        // Create a flex container for the units
        const unitsFlexContainer = document.createElement("div");
        unitsFlexContainer.style.display = "flex";
        unitsFlexContainer.style.gap = "10px";
        unitsFlexContainer.style.flexWrap = "wrap";

        // Fetch and display each attached unit
        for (const attachedUnitDoc of attachedUnitsSnapshot.docs) {
            const unitData = attachedUnitDoc.data();
            const unitDocRef = doc(db, "units", unitData.unitID); // Correct usage of unitID
            const unitDoc = await getDoc(unitDocRef); // Fetch unit details
            if (unitDoc.exists()) {
                const unit = unitDoc.data();

                // Create a pill-shaped element for the unit
                const unitElement = document.createElement("div");
                unitElement.textContent = `${unit.callsign} (${unit.unitType})`;
                unitElement.style.backgroundColor = getStatusColor(unit.status);
                unitElement.style.color = "#FFFFFF"; // Ensure text is readable
                unitElement.style.padding = "10px 15px";
                unitElement.style.borderRadius = "20px";
                unitElement.style.fontSize = "0.9em";
                unitElement.style.fontWeight = "bold";
                unitElement.style.textAlign = "center";
                unitElement.style.whiteSpace = "nowrap";

                // Append the unit element to the flex container
                unitsFlexContainer.appendChild(unitElement);
            }
        }

        // Append the flex container to the attached units container
        attachedUnitsContainer.appendChild(unitsFlexContainer);
    } catch (error) {
        console.error("Error fetching attached units:", error);
        attachedUnitsContainer.textContent = "Failed to load attached units.";
    }
}

// Helper function to get the status color
function getStatusColor(status) {
    switch (status) {
        case 'Available':
        case 'On Scene':
            return '#4CAF50'; // Green for Available
        case 'Unavailable':
            return '#FF5722'; // Red-Orange for Unavailable
        case 'En Route':
            return '#FF5500';
        default:
            return '#9E9E9E'; // Gray for Unknown or undefined statuses
    }
}

// Ensure populateAttachedUnits is defined
document.addEventListener("DOMContentLoaded", () => {
    populateCallsList(); // Ensure calls list is still populated
});

// Function to fetch calls from the database
export async function getCalls() {
    try {
        const querySnapshot = await getDocs(collection(db, "calls"));
        const calls = [];
        querySnapshot.forEach((doc) => {
            calls.push(doc.data());
        });
        return calls;
    } catch (error) {
        console.error("Error fetching calls:", error);
        return [];
    }
}

// Event listener for "Back To Home" button
document.querySelector(".back-button").addEventListener("click", async () => {
    await cleanupOnExit();
    window.location.href = "../index.html";
});
