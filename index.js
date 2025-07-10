import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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
    // Initialize modal functionality if needed
    const loadCivilianBtn = document.getElementById("loadCivilianBtn");
    const proceedWithoutCivilianBtn = document.getElementById("proceedWithoutCivilianBtn");

    if (loadCivilianBtn && proceedWithoutCivilianBtn) {
        // Add functionality to the buttons inside the modal
        loadCivilianBtn.onclick = () => {
            showNotification("Load Civilian functionality not implemented yet.", "info");
        };

        proceedWithoutCivilianBtn.onclick = () => {
            showNotification("Proceeding without a civilian.", "info");
            document.getElementById("civilianModal").style.display = "none"; // Close the modal
        };
    }
});

// Function to create scrolling number effect
function animateCounter(elementId, newValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const currentValue = parseInt(element.dataset.target) || 0;
    const targetValue = parseInt(newValue) || 0;
    
    // Skip animation if value hasn't changed
    if (currentValue === targetValue && element.textContent !== '-') {
        return;
    }
    
    // Store the new target value
    element.dataset.target = targetValue;
    
    // Create scrolling effect with visible number transitions
    const duration = 1200; // Longer duration to see the scrolling
    const startTime = performance.now();
    const startValue = currentValue;
    const valueChange = targetValue - startValue;
    
    // Add scrolling class for CSS effects
    element.classList.add('number-scrolling');
    
    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Create a more dramatic scrolling effect
        let currentNumber;
        if (progress < 0.7) {
            // First 70% - show rapid number changes for scrolling effect
            const scrollProgress = progress / 0.7;
            const easeProgress = 1 - Math.pow(1 - scrollProgress, 2);
            
            if (valueChange > 0) {
                // Counting up - show intermediate numbers
                currentNumber = Math.floor(startValue + (valueChange * easeProgress));
                // Add some random fluctuation for scroll effect
                if (progress < 0.5) {
                    currentNumber += Math.floor(Math.random() * 3);
                }
            } else if (valueChange < 0) {
                // Counting down - show intermediate numbers
                currentNumber = Math.ceil(startValue + (valueChange * easeProgress));
                // Add some random fluctuation for scroll effect
                if (progress < 0.5) {
                    currentNumber -= Math.floor(Math.random() * 3);
                }
            } else {
                currentNumber = startValue;
            }
        } else {
            // Last 30% - settle on final value with easing
            const finalProgress = (progress - 0.7) / 0.3;
            const easeProgress = 1 - Math.pow(1 - finalProgress, 3);
            currentNumber = Math.round(startValue + (valueChange * (0.7 + 0.3 * easeProgress)));
        }
        
        // Ensure we don't go below 0 or show weird numbers
        currentNumber = Math.max(0, currentNumber);
        element.textContent = currentNumber;
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            element.textContent = targetValue; // Ensure we end with exact value
            element.classList.remove('number-scrolling');
        }
    }
    
    if (element.textContent !== '-') {
        requestAnimationFrame(updateNumber);
    } else {
        // For initial load, just set the value
        element.textContent = targetValue;
    }
}

// === Real-time Counter System ===
let counters = {
    police: 0,
    ambulance: 0,
    fire: 0,
    dispatchers: 0,
    civilians: 0,
    total: 0
};

let activeListeners = 0;
const totalListeners = 3; // units, dispatchers, civilians

// Update connection status
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    const dot = statusElement.querySelector('.status-dot');
    const text = statusElement.querySelector('.status-text');
    
    if (!statusElement) return;
    
    switch(status) {
        case 'connecting':
            dot.className = 'status-dot';
            text.textContent = 'Connecting...';
            break;
        case 'connected':
            dot.className = 'status-dot connected';
            text.textContent = 'Live Updates Active';
            break;
        case 'error':
            dot.className = 'status-dot error';
            text.textContent = 'Connection Error - Using Fallback';
            break;
        case 'fallback':
            dot.className = 'status-dot';
            text.textContent = 'Periodic Updates (5s)';
            break;
    }
}

// Function to calculate and update all counters
function calculateAndUpdateCounters() {
    const totalUnits = counters.police + counters.ambulance + counters.fire;
    const calculatedCivilians = Math.max(0, counters.civilians - totalUnits - 1);
    const total = counters.police + counters.ambulance + counters.fire + counters.dispatchers + calculatedCivilians;
    
    // Animate the counters with real-time data
    animateCounter("count-police", counters.police);
    animateCounter("count-ambulance", counters.ambulance);
    animateCounter("count-fire", counters.fire);
    animateCounter("count-dispatchers", counters.dispatchers);
    animateCounter("count-ccivilians", calculatedCivilians);
    animateCounter("count-total", total);
}

// Set up real-time listeners for each collection
function setupRealTimeListeners() {
    updateConnectionStatus('connecting');
    
    try {
        // Real-time listener for units collection
        onSnapshot(collection(db, "units"), (snapshot) => {
            let police = 0, ambulance = 0, fire = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.unitType && typeof data.unitType === "string") {
                    const type = data.unitType.toLowerCase();
                    if (type === "police") police++;
                    else if (type === "ambulance") ambulance++;
                    else if (type === "fire") fire++;
                }
            });
            
            counters.police = police;
            counters.ambulance = ambulance;
            counters.fire = fire;
            calculateAndUpdateCounters();
            
            activeListeners = Math.min(activeListeners + 1, totalListeners);
            if (activeListeners === totalListeners) {
                updateConnectionStatus('connected');
            }
        }, (error) => {
            console.error("Error listening to units:", error);
            updateConnectionStatus('error');
            // Fallback to showing dashes on error
            document.getElementById("count-police").textContent = "-";
            document.getElementById("count-ambulance").textContent = "-";
            document.getElementById("count-fire").textContent = "-";
        });

        // Real-time listener for dispatchers collection
        onSnapshot(collection(db, "dispatchers"), (snapshot) => {
            counters.dispatchers = Math.max(0, snapshot.size - 1); // Subtract 1 for placeholder
            calculateAndUpdateCounters();
            
            activeListeners = Math.min(activeListeners + 1, totalListeners);
            if (activeListeners === totalListeners) {
                updateConnectionStatus('connected');
            }
        }, (error) => {
            console.error("Error listening to dispatchers:", error);
            updateConnectionStatus('error');
            document.getElementById("count-dispatchers").textContent = "-";
        });

        // Real-time listener for civilians collection
        onSnapshot(collection(db, "civilians"), (snapshot) => {
            counters.civilians = snapshot.size;
            calculateAndUpdateCounters();
            
            activeListeners = Math.min(activeListeners + 1, totalListeners);
            if (activeListeners === totalListeners) {
                updateConnectionStatus('connected');
            }
        }, (error) => {
            console.error("Error listening to civilians:", error);
            updateConnectionStatus('error');
            document.getElementById("count-ccivilians").textContent = "-";
        });

        console.log("Real-time listeners established for all collections");
        
    } catch (error) {
        console.error("Error setting up real-time listeners:", error);
        updateConnectionStatus('error');
        // Fallback to interval-based updates if real-time fails
        setTimeout(() => fallbackToIntervalUpdates(), 1000);
    }
}

// Fallback function for when real-time listeners fail
async function fallbackToIntervalUpdates() {
    console.log("Falling back to interval-based updates");
    
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

            // Get all dispatchers
            let dispatchers = 0;
            try {
                const dispSnap = await getDocs(collection(db, "dispatchers"));
                dispatchers = Math.max(0, dispSnap.size - 1); // Subtract 1 for placeholder
            } catch (e) {
                dispatchers = 0;
            }

            // Get all civilians
            let totalCivilians = 0;
            try {
                const civSnap = await getDocs(collection(db, "civilians"));
                totalCivilians = civSnap.size;
            } catch (e) {
                totalCivilians = 0;
            }

            // Calculate total units (all emergency services)
            const totalUnits = police + ambulance + fire;
            
            // Calculate civilians: total civilians - units (since units also have civilian characters) - 1 (placeholder)
            let ccivilians = Math.max(0, totalCivilians - totalUnits - 1);

            // Calculate total (all roles)
            let total = police + ambulance + fire + dispatchers + ccivilians;

            // Animate the counters
            animateCounter("count-police", police);
            animateCounter("count-ambulance", ambulance);
            animateCounter("count-fire", fire);
            animateCounter("count-dispatchers", dispatchers);
            animateCounter("count-ccivilians", ccivilians);
            animateCounter("count-total", total);
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
    
    // Run immediately and then every 5 seconds
    updateActiveCounts();
    setInterval(updateActiveCounts, 5000);
}

document.addEventListener("DOMContentLoaded", () => {
    // Wait for page animations to complete before starting real-time listeners
    setTimeout(() => {
        setupRealTimeListeners();
    }, 1200); // Delay to allow staggered animations to complete
    
    // Add test button to demonstrate scrolling effect
    if (window.location.search.includes('test')) {
        const testBtn = document.createElement('button');
        testBtn.textContent = 'Test Scroll Animation';
        testBtn.style.position = 'fixed';
        testBtn.style.top = '10px';
        testBtn.style.right = '10px';
        testBtn.style.zIndex = '9999';
        testBtn.onclick = () => {
            // Test with random numbers to see scrolling
            animateCounter("count-police", Math.floor(Math.random() * 50));
            animateCounter("count-ambulance", Math.floor(Math.random() * 30));
            animateCounter("count-fire", Math.floor(Math.random() * 25));
            animateCounter("count-dispatchers", Math.floor(Math.random() * 10));
            animateCounter("count-ccivilians", Math.floor(Math.random() * 100));
            animateCounter("count-total", Math.floor(Math.random() * 200));
        };
        document.body.appendChild(testBtn);
    }
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
