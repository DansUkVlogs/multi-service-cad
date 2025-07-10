// admin/admin.js
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Get elements
const userCountEl = document.getElementById("userCount");
const callCountEl = document.getElementById("callCount");

// Fetch user count
// Fetch user count (test data)
async function loadStats() {
    // Get a reference to the test collection
    const testCollectionRef = collection(db, "calls");
  
    // Fetch documents in the collection
    const querySnapshot = await getDocs(testCollectionRef);
  
    // Output the data (for testing)
    querySnapshot.forEach((doc) => {
      console.log(doc.id, " => ", doc.data());
    });
  
    // Example: show count of docs (for user count)
    userCountEl.textContent = querySnapshot.size;
  }
  
  loadStats();

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
