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
