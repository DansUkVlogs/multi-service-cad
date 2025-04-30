function selectRole(role) {
  localStorage.setItem('userRole', role);

  if (role === 'civilian') {
    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [];
    if (savedCivilians.length > 0) {
      // Redirect to the civilian page with saved characters
      window.location.href = `civilian/civilian.html?saved=true`;
      return;
    }
  }

  // Redirect to the selected role's dashboard
  window.location.href = `${role}/${role}.html`;
}

function openCivilianModal() {
    alert("Civilian button clicked!"); // Alert to confirm the button is clicked
    const modal = document.getElementById("civilianModal");
    modal.style.display = "block"; // Show the modal

    // Close the modal when the close button is clicked
    const closeModalBtn = document.getElementById("closeModal");
    closeModalBtn.onclick = () => {
        modal.style.display = "none"; // Hide the modal
    };

    // Close the modal when clicking outside the modal content
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = "none"; // Hide the modal
        }
    };
}

// Ensure the script runs after the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    const loadCivilianBtn = document.getElementById("loadCivilianBtn");
    const proceedWithoutCivilianBtn = document.getElementById("proceedWithoutCivilianBtn");

    // Add functionality to the buttons inside the modal
    loadCivilianBtn.onclick = () => {
        alert("Load Civilian functionality not implemented yet.");
    };

    proceedWithoutCivilianBtn.onclick = () => {
        alert("Proceeding without a civilian.");
        document.getElementById("civilianModal").style.display = "none"; // Close the modal
    };
});
