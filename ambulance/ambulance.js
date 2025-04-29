import { db } from "../firebase/firebase.js";
import { collection, query, where, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let unsubscribeAttachedUnits = null; // Store the unsubscribe function for attached units
let unsubscribeCallDetails = null; // Store the unsubscribe function for the selected call

// Function to populate the calls list dynamically
function populateCallsList() {
    const callsContainer = document.getElementById("calls-container");

    // Query the "calls" collection to filter by service (Ambulance or Multiple)
    const callsCollection = collection(db, "calls");
    const q = query(callsCollection, where("service", "in", ["Ambulance", "Multiple"])); // Filter for Ambulance or Multiple services

    // Listen for real-time updates in the filtered "calls" collection
    onSnapshot(q, snapshot => {
        callsContainer.innerHTML = ""; // Clear the existing calls list
        snapshot.forEach(docSnapshot => {
            const call = docSnapshot.data();
            const callItem = document.createElement("div");
            callItem.className = "call-item";
            callItem.style.backgroundColor = window.getStatusColor(call.status || "Unknown Status");
            callItem.innerHTML = `
                <div class="service">Service: ${call.service || "Unknown Service"}</div>
                <div class="name">Name: ${call.callerName || "Unknown Name"}</div>
                <div class="id">ID: ${call.location || "Unknown Location"}</div>
                <div class="status"><strong>Status:</strong> ${call.status || "Unknown Status"}</div>
                <div class="time"><strong>Time:</strong> ${call.timestamp ? new Date(call.timestamp.seconds * 1000).toLocaleString() : "Unknown Time"}</div>
            `;

            // Add click event listener to handle call selection
            callItem.addEventListener("click", () => selectCall(docSnapshot.id, callItem));
            callsContainer.appendChild(callItem);
        });
    });
}

// Function to populate attached units dynamically
function populateAttachedUnits(callId) {
    const unitsContainer = document.getElementById("attached-units-container");
    unitsContainer.innerHTML = ""; // Clear existing units

    // Unsubscribe from the previous listener, if any
    if (unsubscribeAttachedUnits) {
        unsubscribeAttachedUnits();
    }

    // Query the attachedUnits collection for units with the given callID
    const attachedUnitsCollection = collection(db, "attachedUnits");
    const q = query(attachedUnitsCollection, where("callID", "==", callId));

    // Listen for real-time updates to the attached units
    unsubscribeAttachedUnits = onSnapshot(q, snapshot => {
        unitsContainer.innerHTML = ""; // Clear the container before updating
        if (snapshot.empty) {
            unitsContainer.innerHTML = "<p>No attached units found.</p>"; // Display a message if no units are found
        } else {
            snapshot.forEach(async attachedUnitDoc => {
                const attachedUnit = attachedUnitDoc.data();

                // Fetch the unit details from the units collection using unitID
                const unitDocRef = doc(db, "units", attachedUnit.unitID);
                const unitSnapshot = await getDoc(unitDocRef);

                if (unitSnapshot.exists()) {
                    const unit = unitSnapshot.data();
                    const unitElement = document.createElement("div");
                    unitElement.className = "unit";
                    unitElement.textContent = `${unit.callsign} (${unit.unitType})`;
                    unitElement.style.backgroundColor = window.getStatusColor(unit.status || "Unknown Status"); // Apply status color
                    unitElement.style.color = "#FFFFFF"; // Ensure text is readable
                    unitsContainer.appendChild(unitElement);
                }
            });
        }
    });
}

// Function to handle call selection
function selectCall(callId, callItem) {
    // Remove 'selected' class from all call items
    document.querySelectorAll(".call-item").forEach(item => {
        item.classList.remove("selected");
    });

    // Add 'selected' class to the clicked call item
    callItem.classList.add("selected");

    // Unsubscribe from the previous call's real-time updates, if any
    if (unsubscribeCallDetails) {
        unsubscribeCallDetails();
    }

    // Listen for real-time updates to the selected call
    const callDocRef = doc(db, "calls", callId);
    unsubscribeCallDetails = onSnapshot(callDocRef, docSnapshot => {
        if (docSnapshot.exists()) {
            const selectedCall = docSnapshot.data();
            const callDetails = document.querySelector(".call-details");
            callDetails.querySelector(".incident").textContent = `Incident: ${selectedCall.status || "Unknown Status"}`;
            callDetails.querySelector(".location").textContent = `Location: ${selectedCall.location || "Unknown Location"}`;
            callDetails.querySelector(".callerName").textContent = selectedCall.callerName || "Unknown Caller";
            callDetails.querySelector(".descriptionText").textContent = selectedCall.description || "No Description Available";
            callDetails.querySelector(".timestamp").textContent = `Time Stamp: ${selectedCall.timestamp ? new Date(selectedCall.timestamp.seconds * 1000).toLocaleString() : "Unknown Time"}`;

            // Populate attached units
            populateAttachedUnits(callId);
        }
    });
}

// Ensure the function is invoked on page load
document.addEventListener("DOMContentLoaded", () => {
    populateCallsList();
});
