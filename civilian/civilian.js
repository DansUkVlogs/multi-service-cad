
import { db } from "../firebase/firebase.js";
import { collection, addDoc, deleteDoc, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { logUserAction } from '../firebase/logUserAction.js';
import { initializeMessaging, cleanupMessaging, sendMessage, sendUserMessage, markMessageAsRead, markAllMessagesAsRead } from '../messaging-system.js';

// Import force logout system
import { initializeForceLogout, cleanupForceLogout } from "../firebase/forceLogout.js";

let liveCharacterId = null; // Store the unique ID of the live character

// WebRTC Variables
let localStream = null;
let peerConnection = null;
let currentCallId = null;
let civilianIsMuted = false;
let iceCandidateQueue = []; // Queue for ICE candidates received before remote description
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
];

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

    // Add civilian ID display for force logout compatibility
    let civilianId = sessionStorage.getItem('civilianId');
    let el = document.getElementById('civilian-id-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'civilian-id-display';
        el.style = 'position:fixed;bottom:10px;left:10px;background:#222;color:#fff;padding:6px 12px;border-radius:6px;z-index:1300;font-size:14px;';
        document.body.appendChild(el);
    }
    el.textContent = `Current CivilianID: ${civilianId || ''}`;
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

        // Try to find matching civilian in Firestore and set sessionStorage.civilianId
        try {
            const { getDocs, collection, where, query } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const civiliansRef = collection(db, "civilians");
            const q = query(civiliansRef,
                where("firstName", "==", characterData.firstName),
                where("lastName", "==", characterData.lastName),
                where("dob", "==", characterData.dob)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                // Use the first match
                const docId = snapshot.docs[0].id;
                sessionStorage.setItem('civilianId', docId);
                // Initialize messaging for this civilian ID
                try {
                    cleanupMessaging();
                } catch (e) {
                    console.warn('⚠️ cleanupMessaging failed before civilian init', e);
                }
                initializeMessaging({
                    type: 'civilian',
                    id: docId,
                    name: `${characterData.firstName} ${characterData.lastName}`,
                    canSendMessages: false,
                    canReceiveMessages: true
                });
            } else {
                sessionStorage.removeItem('civilianId');
            }
        } catch (err) {
            console.warn("Could not find matching civilian in Firestore:", err);
            sessionStorage.removeItem('civilianId');
        }

        // Update the civilian ID display
        populateCharacterSlots();

        showNotification(`Loaded character: ${characterData.firstName} ${characterData.lastName}`, "success");
    } else {
        showNotification(`Slot ${parseInt(slot) + 1} is empty.`, "error");
        sessionStorage.removeItem('civilianId');
        populateCharacterSlots();
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

        // Store the live character ID for session tracking and update display immediately
        sessionStorage.setItem('civilianId', liveCharacterId);
        populateCharacterSlots();
        // Reinitialize messaging now that we have a canonical civilianId (so incoming messages are received immediately)
        try {
            try { cleanupMessaging(); } catch (e) { console.warn('⚠️ cleanupMessaging failed before civilian init', e); }
            initializeMessaging({
                type: 'civilian',
                id: liveCharacterId,
                name: `${characterData.firstName} ${characterData.lastName}`,
                canSendMessages: false,
                canReceiveMessages: true
            });
        } catch (e) {
            console.warn('[CIVILIAN] Failed to initialize messaging with live civilianId', e);
        }

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

        // Clear the session storage and cleanup messaging listeners
        try {
            cleanupMessaging();
        } catch (e) {
            console.warn('⚠️ cleanupMessaging failed during unlive', e);
        }
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

// Function to handle opening call type selection modal
function openCallTypeModal() {
    const callTypeModal = document.getElementById("callTypeModal");
    callTypeModal.style.display = "block";

    // Close button handler
    const closeBtn = document.getElementById("callTypeClose");
    closeBtn.onclick = () => {
        callTypeModal.style.display = "none";
    };

    // Text call button handler
    const textCallBtn = document.getElementById("textCallBtn");
    textCallBtn.onclick = () => {
        callTypeModal.style.display = "none";
        openNewCallModal();
    };

    // Voice call button handler
    const voiceCallBtn = document.getElementById("voiceCallBtn");
    voiceCallBtn.onclick = () => {
        callTypeModal.style.display = "none";
        openVoiceCallModal();
    };

    // Close on outside click
    callTypeModal.addEventListener('click', (e) => {
        if (e.target === callTypeModal) {
            callTypeModal.style.display = "none";
        }
    });
}

// Function to handle voice call modal (phone interface)
async function openVoiceCallModal() {
    const voiceCallModal = document.getElementById("voiceCallModal");
    const phoneTime = document.getElementById("phoneTime");
    const phoneCallerName = document.getElementById("phoneCallerName");
    
    // Set current time
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: false 
    });
    phoneTime.textContent = timeString;

    // Set caller name
    const firstName = document.getElementById("first-name").value.trim();
    const lastName = document.getElementById("last-name").value.trim();
    const callerName = (firstName && lastName) ? `${firstName} ${lastName}` : "Unknown Caller";
    phoneCallerName.textContent = callerName;

    voiceCallModal.style.display = "block";

    // Create incoming call document immediately when voice call starts
    let currentIncomingCallId = null;
    try {
        const incomingCallData = {
            callerName: callerName,
            civilianId: liveCharacterId,
            status: 'calling',
            timestamp: new Date(),
            placeholder: false
        };

        // Add to incomingCalls collection immediately
        const callRef = await addDoc(collection(db, "incomingCalls"), incomingCallData);
        currentIncomingCallId = callRef.id;
        console.log("Created incoming call document:", currentIncomingCallId);
        
        // Store call ID for WebRTC use
        sessionStorage.setItem('currentCallId', currentIncomingCallId);
        
        // Set up listener for call status changes
        const callDocRef = doc(db, "incomingCalls", currentIncomingCallId);
        const unsubscribe = onSnapshot(callDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const callData = docSnap.data();
                if (callData.status === 'answered') {
                    // Call was answered by dispatch, update UI
                    handleCallAnswered(ringTone);
                } else if (callData.status === 'declined') {
                    // Call was declined by dispatch
                    handleCallDeclined(ringTone);
                } else if (callData.status === 'ended') {
                    // Call was ended by dispatch
                    handleCallEndedByDispatch(ringTone);
                }
            }
        });

        // Store the unsubscribe function for cleanup
        voiceCallModal.dataset.unsubscribe = 'listener-attached';
        voiceCallModal._cleanup = unsubscribe;

    } catch (error) {
        console.error("Error creating incoming call:", error);
        showNotification("Failed to initiate call. Please try again.", "error");
        return;
    }

    // Create and play ringing tone
    const ringTone = new Audio('../audio/dialing-tone.mp3');
    ringTone.loop = true;
    ringTone.volume = 0.5;
    
    // Play the ringing tone
    ringTone.play().catch(error => {
        console.log('Could not play ringing tone:', error);
    });

    // Function to stop ringing and close modal
    const stopRingingAndClose = () => {
        ringTone.pause();
        ringTone.currentTime = 0;
        voiceCallModal.style.display = "none";
        
        // Clean up listener
        if (voiceCallModal._cleanup) {
            voiceCallModal._cleanup();
            voiceCallModal._cleanup = null;
        }
    };

    // Close button handler
    const closeBtn = document.getElementById("voiceCallClose");
    closeBtn.onclick = () => {
        stopRingingAndClose();
    };

    // End call button handler
    const endCallBtn = document.getElementById("endCallBtn");
    endCallBtn.onclick = async () => {
        try {
            // Update the incoming call status to ended if it exists
            if (currentIncomingCallId) {
                const callRef = doc(db, "incomingCalls", currentIncomingCallId);
                await setDoc(callRef, {
                    status: 'ended',
                    endedAt: new Date(),
                    endedBy: 'civilian'
                }, { merge: true });
                console.log("Updated incoming call status to ended by civilian");
            }

            // Log the voice call action
            await logUserAction(db, 'voice_call_ended', {
                callerName: phoneCallerName.textContent,
                service: 'Emergency Services',
                callType: 'voice',
                civilianId: liveCharacterId,
                incomingCallId: currentIncomingCallId,
                timestamp: new Date()
            });

            showNotification("Voice call ended.", "success");
        } catch (error) {
            console.error("Error ending voice call:", error);
            showNotification("Call ended.", "success");
        }
        
        // Clean up WebRTC connection
        cleanupWebRTC();
        
        stopRingingAndClose();
    };

    // Close on outside click
    voiceCallModal.addEventListener('click', (e) => {
        if (e.target === voiceCallModal) {
            stopRingingAndClose();
        }
    });
}

// Function to handle when the call is answered by dispatch
async function handleCallAnswered(ringTone) {
    console.log("Call answered by dispatch!");
    
    // Stop ringing tone
    if (ringTone) {
        ringTone.pause();
        ringTone.currentTime = 0;
    }
    
    // Update UI to show call is connected
    const callingText = document.querySelector('.calling-text');
    const emergencyNumber = document.querySelector('.emergency-number');
    const endCallBtn = document.getElementById('endCallBtn');
    
    if (callingText) callingText.textContent = 'Connected - Voice Chat Active';
    if (emergencyNumber) emergencyNumber.textContent = 'Emergency Services';
    if (endCallBtn) {
        const labelElement = endCallBtn.querySelector('.phone-btn-label');
        if (labelElement) labelElement.textContent = 'End Call';
        endCallBtn.style.background = '#dc2626'; // Red color for end call
    }

    // Setup mute button for civilian
    const civMuteBtn = document.getElementById('civMuteBtn');
    if (civMuteBtn) {
        civMuteBtn.onclick = () => {
            toggleCivilianMute();
        };
    }
    
    showNotification("Call answered by emergency services - Voice chat starting...", "success");
    
    // Initialize WebRTC for voice chat
    const callId = sessionStorage.getItem('currentCallId');
    if (callId) {
        await initializeWebRTCCivilian(callId);
    }
}

// Function to handle when the call is declined by dispatch
function handleCallDeclined(ringTone) {
    console.log("Call declined by dispatch");
    
    // Stop ringing tone
    if (ringTone) {
        ringTone.pause();
        ringTone.currentTime = 0;
    }
    
    // Close the modal after a brief delay
    setTimeout(() => {
        const voiceCallModal = document.getElementById("voiceCallModal");
        if (voiceCallModal) {
            voiceCallModal.style.display = "none";
            // Clean up listener
            if (voiceCallModal._cleanup) {
                voiceCallModal._cleanup();
                voiceCallModal._cleanup = null;
            }
        }
    }, 1000);
    
    showNotification("Call declined. Please try again or use text call.", "warning");
}

// Function to handle when the call is ended by dispatch
function handleCallEndedByDispatch(ringTone) {
    console.log("Call ended by dispatch");
    
    // Clean up WebRTC connection first
    cleanupWebRTC();
    
    // Stop ringing tone
    if (ringTone) {
        ringTone.pause();
        ringTone.currentTime = 0;
    }
    
    // Close the modal immediately
    const voiceCallModal = document.getElementById("voiceCallModal");
    if (voiceCallModal) {
        voiceCallModal.style.display = "none";
        // Clean up listener
        if (voiceCallModal._cleanup) {
            voiceCallModal._cleanup();
            voiceCallModal._cleanup = null;
        }
    }
    
    showNotification("Call ended by dispatcher. Emergency services have been notified.", "success");
}

// WebRTC Functions for Voice Chat
async function initializeWebRTCCivilian(callId) {
    try {
        currentCallId = callId;
        
        // Get user media (audio only)
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: false 
        });
        
        // Create peer connection
        peerConnection = new RTCPeerConnection({ iceServers });
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from dispatcher');
            
            // Create or get remote audio element
            let remoteAudio = document.getElementById('civilianRemoteAudio');
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = 'civilianRemoteAudio';
                remoteAudio.autoplay = true;
                remoteAudio.controls = true; // Add controls for debugging
                remoteAudio.volume = 1.0;
                document.body.appendChild(remoteAudio);
            }
            
            remoteAudio.srcObject = event.streams[0];
            
            // Ensure audio plays
            remoteAudio.play().then(() => {
                console.log('✅ Civilian receiving dispatcher audio');
            }).catch(err => {
                console.error('❌ Failed to play dispatcher audio:', err);
                // Try to play after user interaction
                document.addEventListener('click', () => {
                    remoteAudio.play().then(() => {
                        console.log('✅ Dispatcher audio started after user interaction');
                    }).catch(e => console.error('❌ Still failed to play:', e));
                }, { once: true });
            });
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate to dispatch');
                sendICECandidate(event.candidate, 'civilian');
            }
        };
        
        // Listen for signaling data from dispatch
        listenForWebRTCSignaling();
        
        // CREATE AND SEND OFFER (civilian initiates WebRTC)
        console.log('Creating WebRTC offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to dispatch
        await setDoc(doc(db, 'webrtcSignaling', currentCallId), {
            type: 'offer',
            data: offer,
            sender: 'civilian',
            timestamp: new Date()
        });
        
        console.log('Civilian WebRTC offer sent to dispatch');
        
    } catch (error) {
        console.error('Error initializing civilian WebRTC:', error);
        showNotification('Failed to initialize voice chat', 'error');
    }
}

async function handleWebRTCAnswer(answer) {
    try {
        if (!peerConnection) return;
        
        console.log('Handling WebRTC answer from dispatch');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        console.log('WebRTC connection established!');
        
        // Process any queued ICE candidates
        await processQueuedIceCandidates();
        
    } catch (error) {
        console.error('Error handling WebRTC answer:', error);
    }
}

// Function to safely add ICE candidates with queue system
async function addIceCandidateWithQueue(candidateData) {
    try {
        const iceCandidate = new RTCIceCandidate({
            candidate: candidateData.candidate,
            sdpMLineIndex: candidateData.sdpMLineIndex,
            sdpMid: candidateData.sdpMid
        });

        // Check if remote description is set
        if (peerConnection.remoteDescription) {
            console.log('Adding ICE candidate immediately');
            await peerConnection.addIceCandidate(iceCandidate);
        } else {
            console.log('Queueing ICE candidate for later processing');
            iceCandidateQueue.push(iceCandidate);
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Function to process queued ICE candidates
async function processQueuedIceCandidates() {
    console.log(`Processing ${iceCandidateQueue.length} queued ICE candidates`);
    
    for (const candidate of iceCandidateQueue) {
        try {
            await peerConnection.addIceCandidate(candidate);
            console.log('Successfully added queued ICE candidate');
        } catch (error) {
            console.error('Error adding queued ICE candidate:', error);
        }
    }
    
    // Clear the queue
    iceCandidateQueue = [];
}

async function sendICECandidate(candidate, sender) {
    try {
        // Convert RTCIceCandidate to plain object for Firebase
        const candidateData = {
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
        };
        
        await setDoc(doc(db, 'webrtcSignaling', currentCallId), {
            type: 'ice-candidate',
            data: candidateData,
            sender: sender,
            timestamp: new Date()
        }, { merge: true });
    } catch (error) {
        console.error('Error sending ICE candidate:', error);
    }
}

function listenForWebRTCSignaling() {
    if (!currentCallId) return;
    
    // Listen for signals from dispatch
    const signalingRef = doc(db, 'webrtcSignaling', currentCallId);
    onSnapshot(signalingRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Only process signals from dispatch
            if (data.sender === 'dispatch') {
                if (data.type === 'answer') {
                    console.log('Received WebRTC answer from dispatch');
                    await handleWebRTCAnswer(data.data);
                } else if (data.type === 'ice-candidate') {
                    console.log('Received ICE candidate from dispatch');
                    if (peerConnection) {
                        await addIceCandidateWithQueue(data.data);
                    }
                }
            }
        }
    });
}

function cleanupWebRTC() {
    console.log('Cleaning up civilian WebRTC connection');
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    currentCallId = null;
    iceCandidateQueue = []; // Clear ICE candidate queue
}

// Function to toggle civilian microphone mute
function toggleCivilianMute() {
    if (!localStream) {
        console.warn('No local stream available for muting');
        return;
    }
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
        console.warn('No audio tracks available for muting');
        return;
    }
    
    // Toggle mute state
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    civilianIsMuted = !civilianIsMuted;
    
    // Update mute button UI
    const civMuteBtn = document.getElementById('civMuteBtn');
    if (civMuteBtn) {
        const iconElement = civMuteBtn.querySelector('.phone-btn-icon');
        const labelElement = civMuteBtn.querySelector('.phone-btn-label');
        
        if (iconElement) iconElement.textContent = civilianIsMuted ? '🔇' : '🔊';
        if (labelElement) labelElement.textContent = civilianIsMuted ? 'Unmute' : 'Mute';
        civMuteBtn.style.background = civilianIsMuted ? '#dc2626' : '#4CAF50';
    }
    
    console.log(`Civilian microphone ${civilianIsMuted ? 'muted' : 'unmuted'}`);
    showNotification(`Microphone ${civilianIsMuted ? 'muted' : 'unmuted'}`, civilianIsMuted ? 'warning' : 'success');
}

// Function to handle creating a new text call
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

    const closeModalBtn = document.getElementById("newCallClose");
    closeModalBtn.onclick = () => {
        newCallModal.style.display = "none"; // Hide the modal when the close button is clicked
    };

    // Close on outside click
    newCallModal.addEventListener('click', (e) => {
        if (e.target === newCallModal) {
            newCallModal.style.display = "none";
        }
    });

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
    // Initialize messaging system for civilian page
    const civilianUser = {
        type: 'civilian',
        id: `civilian-${Date.now()}`,
        name: 'Civilian',
        canSendMessages: false, // Civilians typically only receive messages from admin
        canReceiveMessages: true
    };
    initializeMessaging(civilianUser);
    
    // Initialize force logout system
    initializeForceLogout(db);

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

    // Messaging will be initialized when a real Civilian ID exists (after Go Live or load)

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

    newCallBtn.onclick = openCallTypeModal;

    // Handle page unload or navigation
    window.addEventListener("beforeunload", async (event) => {
        // Clean up any active voice calls
        const voiceCallModal = document.getElementById("voiceCallModal");
        if (voiceCallModal && voiceCallModal.style.display === "block") {
            // If there's an active voice call, try to clean it up
            if (voiceCallModal._cleanup) {
                voiceCallModal._cleanup();
            }
        }
        await unlive();
    });
    
    document.querySelector(".back-button").onclick = async () => {
        // Clean up any active voice calls
        const voiceCallModal = document.getElementById("voiceCallModal");
        if (voiceCallModal && voiceCallModal.style.display === "block") {
            if (voiceCallModal._cleanup) {
                voiceCallModal._cleanup();
            }
        }
        
        await unlive();
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
