import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.log("Failed to initialize Firebase. Check your internet connection.", "error");
    throw e;
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

// === Active Counts Logic (REWRITTEN, more robust) ===
async function updateActiveCounts() {
    try {
        // Get all units
        const unitsSnap = await getDocs(collection(db, "units"));
        let police = 0, ambulance = 0, fire = 0;
        unitsSnap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.unitType && typeof d.unitType === "string") {
                if (d.unitType.toLowerCase() === "police") police++;
                if (d.unitType.toLowerCase() === "ambulance") ambulance++;
                if (d.unitType.toLowerCase() === "fire") fire++;
            }
        });
        police = Math.max(0, police - 1);
        ambulance = Math.max(0, ambulance - 1);
        fire = Math.max(0, fire - 1);

        // Get all dispatchers
        let dispatchers = 0;
        try {
            const dispSnap = await getDocs(collection(db, "dispatchers"));
            dispatchers = Math.max(0, dispSnap.size - 1);
        } catch (e) {
            dispatchers = 0;
        }

        // Get all civilians
        let civilians = 0;
        try {
            const civSnap = await getDocs(collection(db, "civilians"));
            civilians = Math.max(0, civSnap.size - 1);
        } catch (e) {
            civilians = 0;
        }

        // Calculate ccivilians (civilians minus all units and dispatchers)
        let ccivilians = civilians - police - ambulance - fire;
        ccivilians = Math.max(0, ccivilians);

        // Calculate total (all roles)
        let total = police + ambulance + fire + dispatchers + ccivilians;

        document.getElementById("count-police").textContent = police;
        document.getElementById("count-ambulance").textContent = ambulance;
        document.getElementById("count-fire").textContent = fire;
        document.getElementById("count-dispatchers").textContent = dispatchers;
        document.getElementById("count-ccivilians").textContent = ccivilians;
        document.getElementById("count-total").textContent = total;
    } catch (err) {
        // If db or collection fails, show dashes
        document.getElementById("count-police").textContent = "-";
        document.getElementById("count-ambulance").textContent = "-";
        document.getElementById("count-fire").textContent = "-";
        document.getElementById("count-dispatchers").textContent = "-";
        document.getElementById("count-ccivilians").textContent = "-";
        document.getElementById("count-total").textContent = "-";
        console.error("Error updating active counts:", err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateActiveCounts();
    setInterval(updateActiveCounts, 10000);
});

// Remove dispatcher session on page unload (for index page)
window.addEventListener('beforeunload', () => {
    try {
        // Remove any existing dispatcher session, even if the page is reloaded
        const sessionId = sessionStorage.getItem('dispatcherSessionId');
        if (sessionId) {
            const projectId = "emergencycad-561d4";
            const apiKey = firebaseConfig.apiKey;
            const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/dispatchers/${sessionId}?key=${apiKey}`;
            let deleted = false;
            if (navigator.sendBeacon) {
                const blob = new Blob([], { type: 'application/json' });
                deleted = navigator.sendBeacon(url, blob);
            }
            if (!deleted) {
                fetch(url, {
                    method: 'DELETE',
                    keepalive: true
                });
            }
            sessionStorage.removeItem('dispatcherSessionId');
        }
    } catch (e) {
        // Ignore errors on unload
    }
});
