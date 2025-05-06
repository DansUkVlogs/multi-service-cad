import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, doc, deleteDoc, query, where, getDocs, addDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getUnitTypeColor } from "../dispatch/statusColor.js"; // Correctly import the function

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

let liveUnitId = null; // Store the unique ID of the live unit

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
        await addDoc(collection(db, "civilians"), {
            firstName,
            lastName,
            dob,
            phone,
            profilePicture,
            address,
            timestamp: new Date()
        });

        // Display the saved callsign on the main page
        const callsignDisplay = document.getElementById("callsign-display");
        callsignDisplay.textContent = `Saved Callsign: ${callsignInput}`;

        alert("Details saved successfully!");
        return true; // Indicate success
    } catch (error) {
        console.error("Error saving details:", error);
        alert("Failed to save details. Please try again.");
        return false; // Indicate failure
    }
}

export function getContrastingTextColor(backgroundColor) {
    const color = backgroundColor.charAt(0) === '#' ? backgroundColor.slice(1) : backgroundColor;
    const rgb = parseInt(color, 16); // Convert hex to rgb
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
  
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return brightness > 128 ? "#FFFFFF" : "#000000"; // Return black or white text
  }

// Attach event listener to the "Save Details" button
document.addEventListener("DOMContentLoaded", () => {
    const saveDetailsButton = document.getElementById("save-details-btn");
    if (saveDetailsButton) {
        saveDetailsButton.addEventListener("click", async () => {
            const success = await saveDetails();
            if (success) {
                closeModal(); // Close the modal only if saveDetails succeeds
            }
        });
    }
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

// Function to initialize the modal with fade and dropdown functionality
function initializeModal() {
    const setupModal = document.getElementById("setup-modal");
    const overlay = document.getElementById("modal-overlay");

    if (setupModal && overlay) {
        // Display the modal and overlay
        setupModal.style.display = "flex";
        overlay.classList.add("active");

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
    const overlay = document.getElementById("modal-overlay");

    if (setupModal) {
        setupModal.style.display = "none";
    }

    if (overlay) {
        overlay.classList.remove("active");
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

// Function to load a character from the selected slot
function loadCharacterFromSlot() {
    const slotSelect = document.getElementById("slot-select");
    const selectedSlot = slotSelect.value;

    if (!selectedSlot) {
        alert("Please select a slot.");
        return;
    }

    // Retrieve globalCharacters from localStorage
    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const characterData = globalCharacters[selectedSlot];

    if (characterData) {
        const firstNameInput = document.getElementById("first-name");
        const lastNameInput = document.getElementById("last-name");
        const dobInput = document.getElementById("dob");
        const phoneInput = document.getElementById("phone");
        const ageInput = document.getElementById("age");
        const addressInput = document.getElementById("address");
        const profilePicture = document.getElementById("profile-picture");

        // Populate the form fields with character data
        if (firstNameInput) firstNameInput.value = characterData.firstName || "";
        if (lastNameInput) lastNameInput.value = characterData.lastName || "";
        if (dobInput) dobInput.value = characterData.dob || "";
        if (phoneInput) phoneInput.value = characterData.phone || "";
        if (addressInput) addressInput.value = characterData.address || "";

        // Calculate and populate the age field
        if (dobInput && ageInput) {
            if (characterData.dob) {
                const age = calculateAge(characterData.dob);
                ageInput.value = age >= 0 ? age : ""; // Ensure age is not negative
            } else {
                ageInput.value = ""; // Clear the age field if no DOB is provided
            }
        }

        // Update the profile picture
        if (profilePicture) {
            profilePicture.src = characterData.profilePicture || "../imgs/blank-profile-picture-973460.svg";
        }
    } else {
        alert("No character data found for the selected slot.");
    }
}

// Function to calculate age from date of birth
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

// Attach event listener to the "Load Saved Character" button
document.addEventListener("DOMContentLoaded", () => {
    const loadCharacterButton = document.getElementById("load-character-btn");
    if (loadCharacterButton) {
        loadCharacterButton.addEventListener("click", loadCharacterFromSlot);
    }
});

// Function to render calls with the original design and consistent filtering
function renderCalls(calls) {
    const callsContainer = document.getElementById("calls-container");
    callsContainer.innerHTML = ""; // Clear existing calls

    // Apply the filter to show only "Ambulance" or "Multiple" services
    const filteredCalls = calls.filter(call => call.service === "Ambulance" || call.service === "Multiple");

    if (filteredCalls.length === 0) {
        callsContainer.innerHTML = "<p>No calls available.</p>";
        return;
    }

    filteredCalls.forEach(call => {
        const callDiv = document.createElement("div");
        callDiv.classList.add("call-item"); // Match the original class
        callDiv.dataset.callId = call.id; // Store the call ID in a data attribute

        // Create the service box
        const serviceBox = document.createElement("div");
        serviceBox.classList.add("service-box");
        serviceBox.style.backgroundColor = getUnitTypeColor(call.service); // Use the correct function
        serviceBox.style.color = getContrastingTextColor(serviceBox.style.backgroundColor);
        serviceBox.textContent = `Service: ${call.service || "Unknown"}`;

        // Create the status
        const statusDiv = document.createElement("div");
        statusDiv.classList.add("status");
        statusDiv.textContent = `Incident: ${call.status || "Unknown"}`;

        // Create the caller name
        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        nameDiv.textContent = `Caller Name: ${call.callerName || "Unknown"}`;

        // Create the location
        const locationDiv = document.createElement("div");
        locationDiv.classList.add("location");
        locationDiv.textContent = `Location: ${call.location || "Unknown"}`;

        // Create the timestamp
        const timestampDiv = document.createElement("div");
        timestampDiv.classList.add("timestamp");
        const timestamp = call.timestamp?.toDate ? call.timestamp.toDate() : new Date(call.timestamp);
        timestampDiv.textContent = `Time: ${timestamp.toLocaleTimeString("en-GB")} ${timestamp.toLocaleDateString("en-GB")}`;

        // Append all elements to the call item
        callDiv.appendChild(serviceBox);
        callDiv.appendChild(statusDiv);
        callDiv.appendChild(nameDiv);
        callDiv.appendChild(locationDiv);
        callDiv.appendChild(timestampDiv);

        // Add click event listener to select the call
        callDiv.addEventListener("click", () => {
            // Remove highlight from previously selected call
            const previouslySelected = document.querySelector(".call-item.selected");
            if (previouslySelected) {
                previouslySelected.classList.remove("selected");
            }

            // Highlight the selected call
            callDiv.classList.add("selected");

            // Populate the "Call Details" section
            document.querySelector(".incident").textContent = `Incident: ${call.status || "Unknown"}`;
            document.querySelector(".location").textContent = `Location: ${call.location || "Unknown"}`;
            document.querySelector(".callerName").textContent = call.callerName || "Unknown";
            document.querySelector(".descriptionText").textContent = call.description || "No description provided.";
            document.querySelector(".timestamp").textContent = `Time Stamp: ${timestamp.toLocaleString()}`;

            // Populate attached units
            populateAttachedUnits(call.id);
        });("load-character-btn");

        // Add the call item to the containerharacterFromSlot);
        callsContainer.appendChild(callDiv);
    });
}

// Ensure the renderCalls function is called when the page loads
document.addEventListener("DOMContentLoaded", () => {
    onSnapshot(collection(db, "calls"), (snapshot) => {
        const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalls(calls); // Render the calls dynamically
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
            const unitDocRef = doc(db, "units", unitData.unitID);
            const unitDoc = await getDoc(unitDocRef); // Fetch unit details
            if (unitDoc.exists()) {
                const unit = unitDoc.data();

                // Create a pill-shaped element for the unit
                const unitElement = document.createElement("div");
                unitElement.textContent = `${unit.callsign} (${unit.unitType}) - ${unit.status}`;
                unitElement.style.backgroundColor = getUnitTypeColor(unit.unitType);
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

// Real-time listener for updates to the `calls` collection
onSnapshot(collection(db, "calls"), (snapshot) => {
    const selectedCallId = document.querySelector(".call-item.selected")?.dataset.callId;

    // If a call is selected, update the call details dynamically
    if (selectedCallId) {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified" || change.type === "added" || change.type === "removed") {
                const updatedCall = snapshot.docs.find(doc => doc.id === selectedCallId)?.data();
                if (updatedCall) {
                    document.querySelector(".incident").textContent = `Incident: ${updatedCall.status || "Unknown"}`;
                    document.querySelector(".location").textContent = `Location: ${updatedCall.location || "Unknown"}`;
                    document.querySelector(".callerName").textContent = updatedCall.callerName || "Unknown";
                    document.querySelector(".descriptionText").textContent = updatedCall.description || "No description provided.";
                    document.querySelector(".timestamp").textContent = `Time Stamp: ${new Date(updatedCall.timestamp).toLocaleString()}`;
                }
            }
        });
    }
});

// Real-time listener for updates to the `attachedUnits` collection
onSnapshot(collection(db, "attachedUnits"), (snapshot) => {
    const selectedCallId = document.querySelector(".call-item.selected")?.dataset.callId;

    // If a call is selected, update the attached units dynamically
    if (selectedCallId) {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified" || change.type === "added" || change.type === "removed") {
                populateAttachedUnits(selectedCallId);
            }
        });
    }
});

// Call the initialization functions on page load
document.addEventListener("DOMContentLoaded", () => {
    initializeModal();
    populateCharacterSlots();
});
