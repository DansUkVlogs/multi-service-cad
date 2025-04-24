// Initialize Firebase with the provided configuration
const firebaseConfig = {
  apiKey: "AIzaSyBWM3d9NXDzItCM4z3lZK2LC0z41tPw-bE",
  authDomain: "emergencycad-561d4.firebaseapp.com",
  projectId: "emergencycad-561d4",
  storageBucket: "emergencycad-561d4.firebasestorage.app",
  messagingSenderId: "573720799939",
  appId: "1:573720799939:web:5828efc1893892a4929076",
  measurementId: "G-XQ55M4GC92"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Ensure the DOM is fully loaded before attaching event listeners
window.addEventListener('DOMContentLoaded', () => {
  let liveSlot = null; // Track the currently live slot

  // Function to show non-intrusive UI messages
  function showMessage(message, type = 'info') {
    const messageContainer = document.createElement('div');
    messageContainer.className = `message ${type}`;
    messageContainer.textContent = message;
    document.body.appendChild(messageContainer);

    setTimeout(() => {
      messageContainer.remove();
    }, 3000); // Auto-remove after 3 seconds
  }

  // Redirect to home page when "Back To Home" button is clicked
  document.querySelector('.back-button').addEventListener('click', async () => {
    if (liveSlot !== null) {
      try {
        await db.collection('civilians').doc(`slot${liveSlot}`).delete();
        console.log(`Character from slot ${parseInt(liveSlot) + 1} deleted from Firebase.`);
      } catch (error) {
        console.error('Error deleting character from Firebase:', error);
      }
    }
    window.location.href = '../index.html';
  });

  // Handle tab close or refresh
  window.addEventListener('beforeunload', async (event) => {
    if (liveSlot !== null) {
      try {
        await db.collection('civilians').doc(`slot${liveSlot}`).delete();
        console.log(`Character from slot ${parseInt(liveSlot) + 1} deleted from Firebase.`);
      } catch (error) {
        console.error('Error deleting character from Firebase:', error);
      }
    }
  });

  // Handle profile picture upload
  const profileImage = document.querySelector('.profile-picture img');
  const imageUpload = document.createElement('input');
  imageUpload.type = 'file';
  imageUpload.accept = 'image/*';
  imageUpload.style.display = 'none';
  document.body.appendChild(imageUpload);

  profileImage.addEventListener('click', () => {
    imageUpload.click();
  });

  imageUpload.addEventListener('change', function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        profileImage.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Ensure the "Save Current Character" button works
  document.querySelector('.save-character').addEventListener('click', () => {
    const slotSelect = document.getElementById('slot-select');
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
      showMessage('Please select a slot to save the character.', 'error');
      return;
    }

    const form = document.querySelector('form');
    const formData = new FormData(form);
    const civilianDetails = Object.fromEntries(formData.entries());
    const profileImageSrc = document.querySelector('.profile-picture img').src;

    const character = {
      details: civilianDetails,
      profileImage: profileImageSrc,
    };

    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
    savedCivilians[selectedSlot] = character;
    localStorage.setItem('civilians', JSON.stringify(savedCivilians));

    showMessage(`Character saved to slot ${parseInt(selectedSlot) + 1}!`, 'success');
  });

  // Ensure the "Load Saved Character" button works
  document.querySelector('.load-character').addEventListener('click', () => {
    const slotSelect = document.getElementById('slot-select');
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
      showMessage('Please select a slot to load the character.', 'error');
      return;
    }

    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];

    const character = savedCivilians[selectedSlot];

    if (!character) {
      showMessage('No character found in the selected slot.', 'error');
      return;
    }

    // Load character details into the form
    Object.entries(character.details).forEach(([key, value]) => {
      const input = document.querySelector(`[name="${key}"]`);
      if (input) input.value = value;
    });

    // Load profile picture
    document.querySelector('.profile-picture img').src = character.profileImage;

    showMessage(`Character loaded from slot ${parseInt(selectedSlot) + 1}!`, 'success');
  });

  // Ensure the "Go Live" button works
  const goLiveButton = document.querySelector('.go-live');
  const newCallButton = document.querySelector('.new-call');
  goLiveButton.addEventListener('click', async () => {
    const slotSelect = document.getElementById('slot-select');
    const loadButton = document.querySelector('.load-character');
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
      showMessage('Please select a slot to go live.', 'error');
      return;
    }

    if (goLiveButton.textContent === "Go Live") {
      const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
      const character = savedCivilians[selectedSlot];

      if (!character) {
        showMessage('No character found in the selected slot.', 'error');
        return;
      }

      try {
        await db.collection('civilians').doc(`slot${selectedSlot}`).set(character);
        showMessage(`Character from slot ${parseInt(selectedSlot) + 1} is now live!`, 'success');

        // Lock the "Select Slot" and "Load Saved Character" buttons
        slotSelect.disabled = true;
        loadButton.disabled = true;

        // Change button text to "Unlive"
        goLiveButton.textContent = "Unlive";
        goLiveButton.classList.add('flashing'); // Add flashing effect

        liveSlot = selectedSlot; // Track the live slot
        newCallButton.disabled = false; // Enable "New Call" button
      } catch (error) {
        console.error('Error saving character to Firebase:', error);
        showMessage('Failed to go live. Please try again.', 'error');
      }
    } else {
      try {
        await db.collection('civilians').doc(`slot${selectedSlot}`).delete();
        showMessage(`Character from slot ${parseInt(selectedSlot) + 1} is now offline.`, 'success');

        // Unlock the "Select Slot" and "Load Saved Character" buttons
        slotSelect.disabled = false;
        loadButton.disabled = false;

        // Change button text back to "Go Live"
        goLiveButton.textContent = "Go Live";
        goLiveButton.classList.remove('flashing'); // Remove flashing effect

        liveSlot = null; // Clear the live slot
        newCallButton.disabled = true; // Disable "New Call" button
      } catch (error) {
        console.error('Error deleting character from Firebase:', error);
        showMessage('Failed to unlive. Please try again.', 'error');
      }
    }
  });

  // Handle "New Call" modal
  const newCallModal = document.getElementById('newCallModal');
  const closeModal = newCallModal.querySelector('.close');
  const newCallForm = document.getElementById('newCallForm');

  newCallButton.addEventListener('click', () => {
    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
    const character = savedCivilians[liveSlot];
    if (character) {
      document.getElementById('callerName').value = `${character.details['first-name']} ${character.details['last-name']}`;
    }
    newCallModal.style.display = 'block';
  });

  closeModal.addEventListener('click', () => {
    newCallModal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === newCallModal) {
      newCallModal.style.display = 'none';
    }
  });

  // Handle form submission
  newCallForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(newCallForm);
    const callDetails = Object.fromEntries(formData.entries());

    // Use Firestore's server timestamp for accurate time
    callDetails.timestamp = firebase.firestore.FieldValue.serverTimestamp();

    // Set default status and call type
    callDetails.status = "Awaiting Dispatch";
    callDetails.callType = ""; // Empty call type

    try {
      // Add the call to the "calls" collection in Firebase
      await db.collection('calls').add(callDetails);
    } catch (error) {
      console.error('Error adding call to Firebase:', error);
      showMessage('Failed to place the call. Please try again.', 'error');
    }

    newCallModal.style.display = 'none';
  });

  // Ensure the dropdown is initialized correctly on page load
  const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
  const slotSelect = document.getElementById('slot-select');
  savedCivilians.forEach((character, index) => {
    if (character) {
      slotSelect.options[index + 1].text = `Character ${index + 1}`;
    }
  });

  // Ensure the age is calculated correctly from the date of birth
  document.getElementById('dob').addEventListener('input', function () {
    const dob = new Date(this.value);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    document.getElementById('age').value = age >= 0 ? age : ''; // Display the calculated age
  });
});
