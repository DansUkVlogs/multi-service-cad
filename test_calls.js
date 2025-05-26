// Temporary test script to add calls for fade effect testing
// Run this in the browser console on the ambulance page

function addTestCalls() {
    const callsContainer = document.getElementById('calls-container');
    if (!callsContainer) {
        console.log('Calls container not found');
        return;
    }

    // Clear existing content
    callsContainer.innerHTML = '';

    // Create test calls
    const testCalls = [
        { id: 'test1', service: 'Ambulance', status: 'Heart Attack', location: '123 Main St', callerName: 'John Doe', timestamp: new Date() },
        { id: 'test2', service: 'Multiple', status: 'Vehicle Collision', location: '456 Oak Ave', callerName: 'Jane Smith', timestamp: new Date() },
        { id: 'test3', service: 'Ambulance', status: 'Chest Pain', location: '789 Pine Rd', callerName: 'Bob Johnson', timestamp: new Date() },
        { id: 'test4', service: 'Ambulance', status: 'Breathing Difficulty', location: '321 Elm St', callerName: 'Alice Brown', timestamp: new Date() },
        { id: 'test5', service: 'Multiple', status: 'Stroke Symptoms', location: '654 Maple Dr', callerName: 'Charlie Wilson', timestamp: new Date() },
        { id: 'test6', service: 'Ambulance', status: 'Allergic Reaction', location: '987 Cedar Ln', callerName: 'Diana Davis', timestamp: new Date() },
        { id: 'test7', service: 'Ambulance', status: 'Overdose', location: '147 Birch St', callerName: 'Frank Miller', timestamp: new Date() },
        { id: 'test8', service: 'Multiple', status: 'Burn Injury', location: '258 Spruce Ave', callerName: 'Grace Taylor', timestamp: new Date() },
        { id: 'test9', service: 'Ambulance', status: 'Fracture', location: '369 Willow Dr', callerName: 'Henry Clark', timestamp: new Date() },
        { id: 'test10', service: 'Ambulance', status: 'Unconscious Person', location: '741 Poplar Rd', callerName: 'Ivy Anderson', timestamp: new Date() },
        { id: 'test11', service: 'Multiple', status: 'Bleeding', location: '852 Ash St', callerName: 'Jack Thomas', timestamp: new Date() },
        { id: 'test12', service: 'Ambulance', status: 'Seizure', location: '963 Hickory Ave', callerName: 'Kelly White', timestamp: new Date() }
    ];

    testCalls.forEach((call, index) => {
        const callCard = document.createElement('div');
        callCard.classList.add('call-card');
        callCard.dataset.callId = call.id;

        const serviceColor = call.service === 'Ambulance' ? '#0288D1' : '#4CAF50';
        const formattedTimestamp = call.timestamp.toLocaleTimeString('en-GB') + ' ' + call.timestamp.toLocaleDateString('en-GB');

        callCard.innerHTML = `
            <div class="call-info">
                <p class="call-service" style="background-color: ${serviceColor}; font-size: 18px; font-weight: bold; text-align: center;">${call.service}</p>
                <p class="caller-name" style="font-size: 20px; font-weight: bold;">Call Type: ${call.status}</p>
                <p class="call-location" style="font-size: 15px; font-weight: bold;">Location: ${call.location}</p>
                <p class="caller-name" style="font-size: 15px;">Caller Name: ${call.callerName}</p>
                <div class="attached-units" style="margin-top: 10px;">
                    <p style="font-size: 18px; font-weight: bold; color: black;">Attached Units:</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 5px; align-items: flex-start; min-height: 20px; padding: 5px; background-color: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; margin-top: 15px;">
                        <p style="color: #ccc; font-style: italic; text-align: center; padding: 15px; margin: 0;">No Attached Units</p>
                    </div>
                </div>
                <p class="call-timestamp" style="font-size: 12px; color: grey; text-align: right; margin-top: 10px;">${formattedTimestamp}</p>
            </div>
        `;

        callsContainer.appendChild(callCard);
    });

    console.log('Added', testCalls.length, 'test calls for fade effect testing');
}

// Run the function
addTestCalls();
