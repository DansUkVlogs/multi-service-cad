// Ensure the DOM is fully loaded before attaching event listeners
window.addEventListener('DOMContentLoaded', () => {
  // Redirect to home page when "Back To Home" button is clicked
  document.querySelector('.back-button').addEventListener('click', () => {
    window.location.href = '../index.html';
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
      alert('Please select a slot to save the character.');
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

    console.log('Saved Civilians:', JSON.stringify(savedCivilians, null, 2)); // Log saved data

    alert(`Character saved to slot ${parseInt(selectedSlot) + 1}!`);
  });

  // Ensure the "Load Saved Character" button works
  document.querySelector('.load-character').addEventListener('click', () => {
    const slotSelect = document.getElementById('slot-select');
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
      alert('Please select a slot to load the character.');
      return;
    }

    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
    console.log('Retrieved Civilians:', JSON.stringify(savedCivilians, null, 2)); // Log retrieved data

    const character = savedCivilians[selectedSlot];

    if (!character) {
      alert('No character found in the selected slot.');
      return;
    }

    // Load character details into the form
    Object.entries(character.details).forEach(([key, value]) => {
      const input = document.querySelector(`[name="${key}"]`);
      if (input) input.value = value;
    });

    // Load profile picture
    document.querySelector('.profile-picture img').src = character.profileImage;

    alert(`Character loaded from slot ${parseInt(selectedSlot) + 1}!`);
  });

  // Ensure the "Go Live" button works
  document.querySelector('.go-live').addEventListener('click', () => {
    const slotSelect = document.getElementById('slot-select');
    const selectedSlot = slotSelect.value;

    if (selectedSlot === "") {
      alert('Please select a slot to go live.');
      return;
    }

    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [null, null];
    const character = savedCivilians[selectedSlot];

    if (!character) {
      alert('No character found in the selected slot.');
      return;
    }

    console.log('Going Live with Character:', JSON.stringify(character, null, 2)); // Log character details
    alert(`Character from slot ${parseInt(selectedSlot) + 1} is now live!`);
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
