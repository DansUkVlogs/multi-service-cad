
import { db } from "../firebase/firebase.js";
import { collection, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { logUserAction } from '../firebase/logUserAction.js';

let liveCharacterId = null; // Store the unique ID of the live character

// Function to populate character slots dynamically
function populateCharacterSlots() {
    const slotSelect = document.getElementById("slot-select");
    slotSelect.innerHTML = ""; // Clear existing options

    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};

    // Loop through the two character slots
    for (let i = 0; i < 2; i++) {
        const characterData = globalCharacters[`slot${i}`];
        if (characterData) {
            slotSelect.innerHTML += `<option value="${i}">Character ${i + 1}: ${characterData.firstName} ${characterData.lastName}</option>`;
        } else {
            slotSelect.innerHTML += `<option value="${i}">Character ${i + 1} (Empty)</option>`;
        }
    }
}

// Function to load a character from the selected slot
async function loadCharacterFromSlot(slot) {
    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const characterData = globalCharacters[`slot${slot}`];

    if (characterData) {
        document.getElementById("first-name").value = characterData.firstName || "";
        document.getElementById("last-name").value = characterData.lastName || "";
        document.getElementById("dob").value = characterData.dob || "";
        document.getElementById("phone").value = characterData.phone || "";
        document.getElementById("address").value = characterData.address || "";

        // Update the age field
        const ageInput = document.getElementById("age");
        if (characterData.dob) {
            const age = calculateAge(characterData.dob);
            ageInput.value = age >= 0 ? age : ""; // Ensure age is not negative
        } else {
            ageInput.value = ""; // Clear the age field if no date of birth is provided
        }

        // Load the profile picture
        const profilePicture = document.getElementById("profile-picture");
        profilePicture.src = characterData.profilePicture || "../imgs/blank-profile-picture-973460.svg";

        // Log the character load action
        try {
            console.log("DEBUG: About to call logUserAction for load_character with db:", !!db);
            await logUserAction(db, 'load_character', {
                slot: parseInt(slot) + 1, // Convert to 1-based indexing
                character: {
                    firstName: characterData.firstName,
                    lastName: characterData.lastName,
                    fullName: `${characterData.firstName} ${characterData.lastName}`,
                    dob: characterData.dob,
                    phone: characterData.phone,
                    address: characterData.address,
                    age: characterData.dob ? calculateAge(characterData.dob) : null
                }
            });
            console.log("DEBUG: logUserAction for load_character completed successfully");
        } catch (error) {
            console.error("Error logging character load:", error);
        }

        showNotification(`Loaded character: ${characterData.firstName} ${characterData.lastName}`, "success");
    } else {
        showNotification(`Slot ${parseInt(slot) + 1} is empty.`, "error");
    }
}

// Function to calculate age based on date of birth
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

// Function to update the age field when the DOB changes
function updateAge() {
    const dobInput = document.getElementById("dob").value;
    const ageInput = document.getElementById("age");

    if (dobInput) {
        const age = calculateAge(dobInput);
        ageInput.value = age >= 0 ? age : ""; // Ensure age is not negative
    } else {
        ageInput.value = ""; // Clear the age field if no DOB is provided
    }
}

// Function to save a character to a global local storage key
async function saveCharacterToSlot(slot) {
    const firstName = document.getElementById("first-name").value.trim();
    const lastName = document.getElementById("last-name").value.trim();
    const dob = document.getElementById("dob").value;
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const profilePicture = localStorage.getItem("tempProfilePicture"); // Get the temporarily stored profile picture

    if (!firstName || !lastName) {
        showNotification("First and last names are required.", "error");
        return;
    }

    const characterData = {
        firstName,
        lastName,
        dob,
        phone,
        address,
        profilePicture // Save the profile picture
    };

    // Get previous character data for logging
    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const previousCharacterData = globalCharacters[`slot${slot}`] || null;

    // Save to a global key
    globalCharacters[`slot${slot}`] = characterData;
    localStorage.setItem("globalCharacters", JSON.stringify(globalCharacters));

    // Log the character save action
    try {
        console.log("DEBUG: About to call logUserAction for save_character with db:", !!db);
        await logUserAction(db, 'save_character', {
            slot: parseInt(slot) + 1, // Convert to 1-based indexing for readability
            newCharacter: {
                firstName,
                lastName,
                dob,
                phone,
                address,
                age: dob ? calculateAge(dob) : null
            },
            previousCharacter: previousCharacterData ? {
                firstName: previousCharacterData.firstName,
                lastName: previousCharacterData.lastName,
                dob: previousCharacterData.dob,
                phone: previousCharacterData.phone,
                address: previousCharacterData.address,
                age: previousCharacterData.dob ? calculateAge(previousCharacterData.dob) : null
            } : null,
            action: previousCharacterData ? 'overwrite_existing' : 'save_new'
        });
        console.log("DEBUG: logUserAction for save_character completed successfully");
    } catch (error) {
        console.error("Error logging character save:", error);
    }

    showNotification(`Character saved: ${firstName} ${lastName}`, "success");
    populateCharacterSlots(); // Refresh the dropdown
}

// Function to handle profile picture upload
function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const profilePicture = document.getElementById("profile-picture");
            profilePicture.src = e.target.result;

            // Temporarily store the uploaded picture in local storage
            localStorage.setItem("tempProfilePicture", e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

// Function to handle going live
async function goLive() {
    const slotSelect = document.getElementById("slot-select");
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
        showNotification("Please select a slot to go live.", "warning");
        return;
    }

    const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
    const characterData = globalCharacters[`slot${selectedSlot}`];

    if (!characterData) {
        showNotification("Please save a character to the selected slot before going live.", "warning");
        return;
    }

    try {
        // Add the character to the "civilians" collection in Firestore
        const docRef = await addDoc(collection(db, "civilians"), {
            firstName: characterData.firstName,
            lastName: characterData.lastName,
            dob: characterData.dob,
            phone: characterData.phone,
            address: characterData.address,
            profilePicture: characterData.profilePicture,
            timestamp: new Date()
        });

        liveCharacterId = docRef.id; // Store the unique ID of the live character

        // Store the live character ID for session tracking
        sessionStorage.setItem('civilianId', liveCharacterId);

        // Log the go live action
        await logUserAction(db, 'go_live', {
            characterId: liveCharacterId,
            slot: parseInt(selectedSlot) + 1, // Convert to 1-based indexing
            character: {
                firstName: characterData.firstName,
                lastName: characterData.lastName,
                fullName: `${characterData.firstName} ${characterData.lastName}`,
                dob: characterData.dob,
                phone: characterData.phone,
                address: characterData.address,
                age: characterData.dob ? calculateAge(characterData.dob) : null
            }
        });

        // Change the button to "Unlive" and add flashing red effect
        const goLiveBtn = document.getElementById("go-live-btn");
        goLiveBtn.textContent = "Unlive";
        goLiveBtn.classList.add("unlive");
        goLiveBtn.style.backgroundColor = "red";
        goLiveBtn.onclick = unlive; // Change the button's functionality to "Unlive"

        // Enable the "New Call" button
        const newCallBtn = document.querySelector(".new-call");
        newCallBtn.disabled = false;

        // Disable dropdown, "Load Saved Character," and "Save Current Character" buttons
        slotSelect.disabled = true;
        document.querySelector(".load-character").disabled = true;
        document.querySelector(".save-character").disabled = true;

        showNotification(`You are now live with ${characterData.firstName} ${characterData.lastName}!`, "success");
    } catch (error) {
        console.error("Error going live:", error);
        showNotification("Failed to go live. Please try again.", "error");
    }
}

// Function to handle going offline
async function unlive() {
    if (!liveCharacterId) {
        console.log("No live character to remove.");
        return; // No live character to remove
    }

    try {
        // Get character data for logging before removal
        const globalCharacters = JSON.parse(localStorage.getItem("globalCharacters")) || {};
        const slotSelect = document.getElementById("slot-select");
        const selectedSlot = slotSelect.value;
        const characterData = globalCharacters[`slot${selectedSlot}`];

        // Log the go unlive action
        await logUserAction(db, 'go_unlive', {
            characterId: liveCharacterId,
            slot: selectedSlot ? parseInt(selectedSlot) + 1 : null,
            character: characterData ? {
                firstName: characterData.firstName,
                lastName: characterData.lastName,
                fullName: `${characterData.firstName} ${characterData.lastName}`,
                dob: characterData.dob,
                phone: characterData.phone,
                address: characterData.address,
                age: characterData.dob ? calculateAge(characterData.dob) : null
            } : null
        });

        // Remove the character from the "civilians" collection in Firestore
        console.log(`Removing character with ID: ${liveCharacterId} from the civilians collection.`);
        await deleteDoc(doc(db, "civilians", liveCharacterId));
        liveCharacterId = null; // Clear the stored ID

        // Clear the session storage
        sessionStorage.removeItem('civilianId');

        // Change the button back to "Go Live"
        const goLiveBtn = document.getElementById("go-live-btn");
        goLiveBtn.textContent = "Go Live";
        goLiveBtn.classList.remove("unlive");
        goLiveBtn.style.backgroundColor = "#4CAF50"; // Reset to green
        goLiveBtn.onclick = goLive; // Change the button's functionality back to "Go Live"

        // Disable the "New Call" button
        const newCallBtn = document.querySelector(".new-call");
        newCallBtn.disabled = true;

        // Re-enable dropdown, "Load Saved Character," and "Save Current Character" buttons
        slotSelect.disabled = false;
        document.querySelector(".load-character").disabled = false;
        document.querySelector(".save-character").disabled = false;

        console.log("Character successfully removed from the civilians collection.");
    } catch (error) {
        console.error("Error removing character from the civilians collection:", error);
        showNotification("Failed to remove the character. Please try again.", "error");
    }
}

// Function to handle creating a new call
function openNewCallModal() {
    const newCallModal = document.getElementById("newCallModal");
    const callerNameInput = document.getElementById("callerName");

    // Populate the caller name with the currently loaded character's name
    const firstName = document.getElementById("first-name").value.trim();
    const lastName = document.getElementById("last-name").value.trim();
    if (firstName && lastName) {
        callerNameInput.value = `${firstName} ${lastName}`;
    } else {
        callerNameInput.value = "Unknown Caller"; // Default if no character is loaded
    }

    newCallModal.style.display = "block"; // Show the modal

    const closeModalBtn = newCallModal.querySelector(".close");
    closeModalBtn.onclick = () => {
        newCallModal.style.display = "none"; // Hide the modal when the close button is clicked
    };

    const newCallForm = document.getElementById("newCallForm");
    newCallForm.onsubmit = async (event) => {
        event.preventDefault(); // Prevent the form from submitting normally

        const description = document.getElementById("description").value.trim();
        const location = document.getElementById("location").value.trim();
        const service = document.getElementById("service").value;

        if (!description || !location || !service) {
            showNotification("Please fill in all required fields.", "warning");
            return;
        }

        try {
            // Add the new call to the "calls" collection in Firestore
            const docRef = await addDoc(collection(db, "calls"), {
                callType: "",
                callerName: callerNameInput.value,
                description,
                location,
                service,
                status: "NEW CALL",
                timestamp: new Date()
            });

            // Log the new call creation
            await logUserAction(db, 'create_new_call', {
                callId: docRef.id,
                callerName: callerNameInput.value,
                description,
                location,
                service,
                characterId: liveCharacterId,
                character: firstName && lastName ? {
                    firstName,
                    lastName,
                    fullName: `${firstName} ${lastName}`
                } : null
            });

            showNotification("New call placed successfully!", "success");
            newCallModal.style.display = "none"; // Hide the modal after submission
        } catch (error) {
            console.error("Error placing new call:", error);
            showNotification("Failed to place the call. Please try again.", "error");
            
            // Log the error
            await logUserAction(db, 'create_new_call_error', {
                error: error.message,
                callerName: callerNameInput.value,
                description,
                location,
                service,
                characterId: liveCharacterId
            });
        }
    };
}

// Ensure the buttons are functional on page load
document.addEventListener("DOMContentLoaded", () => {
    populateCharacterSlots();

    const profilePictureInput = document.getElementById("profile-picture-input");
    profilePictureInput.addEventListener("change", handleProfilePictureUpload);

    const dobInput = document.getElementById("dob");
    dobInput.addEventListener("input", updateAge); // Update age when DOB changes

    const saveCharacterBtn = document.querySelector(".save-character");
    const loadCharacterBtn = document.querySelector(".load-character");
    const goLiveBtn = document.getElementById("go-live-btn");
    const newCallBtn = document.querySelector(".new-call");

    // Disable "New Call" button by default
    newCallBtn.disabled = true;

    saveCharacterBtn.onclick = async () => {
        const slotSelect = document.getElementById("slot-select");
        const selectedSlot = slotSelect.value;

        if (selectedSlot === "") {
            showNotification("Please select a slot.", "warning");
            return;
        }

        await saveCharacterToSlot(selectedSlot);
    };

    loadCharacterBtn.onclick = async () => {
        const slotSelect = document.getElementById("slot-select");
        const selectedSlot = slotSelect.value;

        if (selectedSlot === "") {
            showNotification("Please select a slot.", "warning");
            return;
        }

        await loadCharacterFromSlot(selectedSlot);
    };

    goLiveBtn.onclick = goLive;

    newCallBtn.onclick = openNewCallModal;

    // Handle page unload or navigation
    window.addEventListener("beforeunload", unlive);
    document.querySelector(".back-button").onclick = () => {
        unlive();
        window.location.href = "../index.html";
    };

    // Display user identity button
    displayUserIdentityButton();
});

// Display user identity button (for editing Discord/IRL names)
function displayUserIdentityButton() {
    let identityBtn = document.getElementById('user-identity-btn');
    if (!identityBtn) {
        identityBtn = document.createElement('button');
        identityBtn.id = 'user-identity-btn';
        identityBtn.textContent = '👤 Edit User Details';
        identityBtn.title = 'Click to edit your Discord name and IRL name for logging';
        identityBtn.style.cssText = `
            position: fixed; bottom: 20px; right: 24px; 
            background: #1976d2; color: #fff; border: none; 
            padding: 8px 16px; border-radius: 6px; 
            font-size: 13px; font-weight: bold; 
            cursor: pointer; z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
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
    document.getElementById('save-identity-btn').addEventListener('click', async () => {
        const newDiscordName = document.getElementById('discord-name-input').value.trim();
        const newIrlName = document.getElementById('irl-name-input').value.trim();

        if (!newDiscordName || !newIrlName) {
            alert('Please fill in both Discord name and IRL name.');
            return;
        }

        localStorage.setItem('discordName', newDiscordName);
        localStorage.setItem('irlName', newIrlName);
        
        // Log the identity update
        await logUserAction(db, 'update_user_identity', {
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
