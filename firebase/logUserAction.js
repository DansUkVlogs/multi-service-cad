// Logging utility for all services/pages

// Modular logging utility for all services/pages
import { addDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/**
 * Determines the service type based on URL and page elements
 */
function detectServiceType() {
    // Check URL path first
    const currentPath = window.location.pathname.toLowerCase();
    
    if (currentPath.includes('/dispatch/')) return 'Dispatch';
    if (currentPath.includes('/ambulance/')) return 'Ambulance';
    if (currentPath.includes('/police/')) return 'Police';
    if (currentPath.includes('/fire/')) return 'Fire';
    if (currentPath.includes('/civilian/')) return 'Civilian';
    
    // Fallback: check for page-specific elements
    if (document.getElementById('callsign-display')) {
        // This suggests a unit page (ambulance, police, fire)
        const titleElement = document.querySelector('title');
        if (titleElement) {
            const title = titleElement.textContent.toLowerCase();
            if (title.includes('ambulance')) return 'Ambulance';
            if (title.includes('police')) return 'Police';
            if (title.includes('fire')) return 'Fire';
        }
        return 'Unit'; // Generic unit if we can't determine specific type
    }
    
    if (document.getElementById('civilian-id-display')) return 'Civilian';
    if (document.querySelector('[data-service="dispatch"]') || document.getElementById('dispatcher-tools')) return 'Dispatch';
    
    return 'Unknown';
}

/**
 * Ensures user identity is captured before logging
 */
async function ensureUserIdentity() {
    let discordName = localStorage.getItem('discordName');
    let irlName = localStorage.getItem('irlName');
    
    // Check if either name is missing
    if (!discordName || discordName === 'Unknown' || !irlName || irlName === 'Unknown') {
        return new Promise((resolve) => {
            // Create modal
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.5); display: flex; align-items: center;
                justify-content: center; z-index: 10000;
            `;
            
            modal.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 15px; max-width: 400px; width: 90%;">
                    <h3 style="margin: 0 0 20px 0; color: #1976d2; text-align: center;">User Identity Required</h3>
                    <p style="margin: 0 0 20px 0; color: #333;">Please enter your details for audit logging:</p>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Discord Name:</label>
                        <input type="text" id="discord-name-input" placeholder="e.g. Username#1234" 
                               value="${discordName && discordName !== 'Unknown' ? discordName : ''}"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Real Name:</label>
                        <input type="text" id="irl-name-input" placeholder="e.g. John Smith"
                               value="${irlName && irlName !== 'Unknown' ? irlName : ''}"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box;">
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button id="save-identity-btn" style="flex: 1; padding: 10px; background: #1976d2; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Save</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const discordInput = document.getElementById('discord-name-input');
            const irlInput = document.getElementById('irl-name-input');
            const saveBtn = document.getElementById('save-identity-btn');
            const cancelBtn = document.getElementById('cancel-identity-btn');
            
            // Focus first empty field
            if (!discordName || discordName === 'Unknown') {
                discordInput.focus();
            } else {
                irlInput.focus();
            }
            
            function cleanup() {
                document.body.removeChild(modal);
            }
            
            saveBtn.onclick = () => {
                const newDiscordName = discordInput.value.trim();
                const newIrlName = irlInput.value.trim();
                
                if (!newDiscordName || !newIrlName) {
                    alert('Please fill in both fields');
                    return;
                }
                
                // Save to localStorage
                localStorage.setItem('discordName', newDiscordName);
                localStorage.setItem('irlName', newIrlName);
                
                cleanup();
                resolve({ discordName: newDiscordName, irlName: newIrlName });
            };
            
            cancelBtn.onclick = () => {
                cleanup();
                resolve({ discordName: 'Unknown', irlName: 'Unknown' });
            };
            
            // Handle Enter key
            function handleEnter(e) {
                if (e.key === 'Enter') {
                    saveBtn.click();
                }
            }
            discordInput.addEventListener('keypress', handleEnter);
            irlInput.addEventListener('keypress', handleEnter);
        });
    }
    
    return { discordName, irlName };
}

/**
 * Logs a user action to Firestore and deletes logs older than 1 week.
 * @param {object} db - Firestore database instance
 * @param {string} action - Action performed
 * @param {object|string} details - Details about the action
 */
export async function logUserAction(db, action, details) {
    console.log("DEBUG: logUserAction called with:", { db: !!db, action, details });
    
    try {
        // Ensure user identity is captured
        const { discordName, irlName } = await ensureUserIdentity();
        console.log("DEBUG: User identity captured:", { discordName, irlName });
        
        // Determine which ID to use based on the current page/service
        let serviceId = 'Unknown';
        let serviceType = detectServiceType();
        console.log("DEBUG: Service type detected:", serviceType);
        
        // Get the appropriate ID based on service type
        switch (serviceType) {
            case 'Dispatch':
                serviceId = sessionStorage.getItem('dispatcherSessionId') || 'Unknown';
                break;
            case 'Ambulance':
            case 'Police':
            case 'Fire':
            case 'Unit':
                serviceId = sessionStorage.getItem('unitId') || 'Unknown';
                break;
            case 'Civilian':
                serviceId = sessionStorage.getItem('civilianId') || 'Unknown';
                break;
            default:
                // Fallback: try to determine from available sessionStorage
                const unitId = sessionStorage.getItem('unitId');
                const civilianId = sessionStorage.getItem('civilianId');
                const dispatcherId = sessionStorage.getItem('dispatcherSessionId');
                
                if (unitId && unitId !== 'None') {
                    serviceId = unitId;
                    serviceType = 'Unit';
                } else if (civilianId && civilianId !== 'None') {
                    serviceId = civilianId;
                    serviceType = 'Civilian';
                } else if (dispatcherId) {
                    serviceId = dispatcherId;
                    serviceType = 'Dispatch';
                }
        }
        
        const now = new Date();
        
        // Get additional context information
        const callsign = sessionStorage.getItem('callsign') || 
                        document.getElementById('callsign-display')?.textContent?.trim() || 
                        'Unknown';
        
        const logEntry = {
            timestamp: now,
            action,
            details,
            serviceId,
            serviceType,
            callsign: serviceType === 'Unit' || serviceType === 'Ambulance' || serviceType === 'Police' || serviceType === 'Fire' ? callsign : 'N/A',
            discordName,
            irlName,
            // Legacy fields for compatibility
            dispatcherID: serviceType === 'Dispatch' ? serviceId : 'N/A',
            unitId: (serviceType === 'Unit' || serviceType === 'Ambulance' || serviceType === 'Police' || serviceType === 'Fire') ? serviceId : 'N/A',
            civilianId: serviceType === 'Civilian' ? serviceId : 'N/A'
        };

        console.log("DEBUG: Log entry to be added:", logEntry);

        // Add the new log entry
        const docRef = await addDoc(collection(db, 'logs'), logEntry);
        console.log("DEBUG: Log entry successfully added with ID:", docRef.id);
        
        // Debug log to console
        console.log('[LOG] User action logged:', {
            action,
            serviceType,
            serviceId,
            callsign: logEntry.callsign,
            discordName,
            irlName
        });

        // Delete logs older than 1 week (run cleanup less frequently to avoid performance issues)
        if (Math.random() < 0.1) { // Only run cleanup 10% of the time
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const logsRef = collection(db, 'logs');
            const oldLogsQuery = query(logsRef, where('timestamp', '<', oneWeekAgo));
            const oldLogsSnapshot = await getDocs(oldLogsQuery);
            for (const docSnap of oldLogsSnapshot.docs) {
                await deleteDoc(docSnap.ref);
            }
        }
    } catch (e) {
        console.error('DEBUG: Failed to log user action:', action, details, e);
        console.error('DEBUG: Full error object:', e);
    }
}

