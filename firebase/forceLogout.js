// Force Logout System
// This file handles admin-initiated force logouts for all user types

import { getFirestore, doc, deleteDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

let forceLogoutListener = null;
let db = null;

// Initialize the force logout system
export function initializeForceLogout(database) {
    db = database;
    setupForceLogoutListener();
}

// Set up listener for force logout events
function setupForceLogoutListener() {
    const userId = sessionStorage.getItem('unitId') || sessionStorage.getItem('civilianId') || sessionStorage.getItem('dispatcherId');
    if (!userId) return;

    // Determine user type and collection
    let collection, userType;
    if (sessionStorage.getItem('unitId')) {
        collection = 'units';
        userType = 'unit';
    } else if (sessionStorage.getItem('civilianId')) {
        collection = 'civilians';
        userType = 'civilian';
    } else if (sessionStorage.getItem('dispatcherId')) {
        collection = 'dispatchers';
        userType = 'dispatcher';
    }

    if (!collection) return;

    console.log(`[FORCE LOGOUT] Monitoring ${userType} ${userId} for force logout`);

    // Listen for changes to the user document
    const userDocRef = doc(db, collection, userId);
    forceLogoutListener = onSnapshot(userDocRef, (docSnapshot) => {
        if (!docSnapshot.exists()) {
            // Document was deleted - this is a force logout
            console.log(`[FORCE LOGOUT] ${userType} ${userId} was force logged out`);
            handleForceLogout(userType);
        } else {
            const data = docSnapshot.data();
            // Check for force logout flag
            if (data.forceLogout === true) {
                console.log(`[FORCE LOGOUT] ${userType} ${userId} received force logout flag`);
                handleForceLogout(userType);
            }
        }
    });
}

// Handle the actual force logout
async function handleForceLogout(userType) {
    // Clean up the listener
    if (forceLogoutListener) {
        forceLogoutListener();
        forceLogoutListener = null;
    }

    // Show force logout modal
    showForceLogoutModal(userType);
}

// Show the force logout modal
function showForceLogoutModal(userType) {
    // Remove any existing modal
    const existingModal = document.getElementById('force-logout-modal');
    if (existingModal) existingModal.remove();

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'force-logout-modal';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 0;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        border: 3px solid #dc2626;
        animation: forceLogoutSlideIn 0.4s ease-out;
    `;

    // Add animation keyframes
    if (!document.getElementById('force-logout-styles')) {
        const style = document.createElement('style');
        style.id = 'force-logout-styles';
        style.textContent = `
            @keyframes forceLogoutSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-50px) scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            @keyframes forceLogoutPulse {
                0%, 100% {
                    border-color: #dc2626;
                    box-shadow: 0 20px 60px rgba(220, 38, 38, 0.4);
                }
                50% {
                    border-color: #ef4444;
                    box-shadow: 0 20px 60px rgba(239, 68, 68, 0.6);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Add pulsing animation to modal
    modal.style.animation = 'forceLogoutSlideIn 0.4s ease-out, forceLogoutPulse 2s infinite';

    modal.innerHTML = `
        <!-- Header -->
        <div style="
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            color: white;
            padding: 24px;
            text-align: center;
        ">
            <div style="font-size: 3rem; margin-bottom: 12px;">⚠️</div>
            <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700;">
                Force Logout Notice
            </h2>
            <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 1rem;">
                Administrative Action Required
            </p>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px 24px;">
            <div style="
                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                border: 2px solid #fca5a5;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                text-align: center;
            ">
                <div style="font-size: 1.3rem; font-weight: 700; color: #991b1b; margin-bottom: 8px;">
                    You have been logged off by an administrator
                </div>
                <div style="font-size: 1rem; color: #7f1d1d; line-height: 1.5;">
                    Your session has been terminated by system administration. 
                    You will be redirected to the home page.
                </div>
            </div>
            
            <div style="
                background: #f8fafc;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 24px;
                font-size: 0.9rem;
                color: #64748b;
                text-align: center;
                border-left: 4px solid #3b82f6;
            ">
                📋 Your ${userType} data has been automatically removed from the system
            </div>
        </div>
        
        <!-- Footer -->
        <div style="
            padding: 20px 24px 24px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            text-align: center;
        ">
            <button id="force-logout-home-btn" style="
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                color: white;
                border: none;
                padding: 14px 32px;
                border-radius: 10px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 0 auto;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(59, 130, 246, 0.4)'" 
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px rgba(59, 130, 246, 0.3)'">
                🏠 Back to Home
            </button>
        </div>
    `;

    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // Add event listener for the home button
    document.getElementById('force-logout-home-btn').addEventListener('click', () => {
        performLogoutCleanup(userType);
    });

    // Prevent closing by clicking outside
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            // Don't allow closing - force user to click the button
            modal.style.animation = 'forceLogoutSlideIn 0.2s ease-out, forceLogoutPulse 2s infinite';
        }
    });
}

// Perform cleanup and redirect to home
async function performLogoutCleanup(userType) {
    try {
        console.log(`[FORCE LOGOUT] Performing cleanup for ${userType}`);
        
        // Get user IDs
        const unitId = sessionStorage.getItem('unitId');
        const civilianId = sessionStorage.getItem('civilianId');
        const dispatcherId = sessionStorage.getItem('dispatcherId');

        // Handle different user types
        if (userType === 'unit' || (userType === 'civilian' && unitId)) {
            // For units or civilians associated with units
            await cleanupUnit(unitId);
            if (civilianId) {
                await cleanupCivilian(civilianId);
            }
        } else if (userType === 'civilian' && !unitId) {
            // For standalone civilians
            await cleanupCivilian(civilianId);
        } else if (userType === 'dispatcher') {
            // For dispatchers
            await cleanupDispatcher(dispatcherId);
        }

        // Clear session storage
        sessionStorage.clear();
        
        // Show cleanup success message briefly
        showCleanupMessage();
        
        // Redirect to home after a brief delay
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);

    } catch (error) {
        console.error('[FORCE LOGOUT] Error during cleanup:', error);
        // Still redirect even if cleanup fails
        sessionStorage.clear();
        window.location.href = '../index.html';
    }
}

// Cleanup unit data
async function cleanupUnit(unitId) {
    if (!unitId) return;

    try {
        // Remove from units collection
        const unitDocRef = doc(db, 'units', unitId);
        const unitExists = await getDoc(unitDocRef);
        if (unitExists.exists()) {
            await deleteDoc(unitDocRef);
            console.log(`[FORCE LOGOUT] Removed unit ${unitId} from units collection`);
        }

        // Remove from availableUnits collection
        const availableUnitDocRef = doc(db, 'availableUnits', unitId);
        const availableExists = await getDoc(availableUnitDocRef);
        if (availableExists.exists()) {
            await deleteDoc(availableUnitDocRef);
            console.log(`[FORCE LOGOUT] Removed unit ${unitId} from availableUnits collection`);
        }

        // Remove from attachedUnit collection
        const attachedUnitDocRef = doc(db, 'attachedUnit', unitId);
        const attachedExists = await getDoc(attachedUnitDocRef);
        if (attachedExists.exists()) {
            await deleteDoc(attachedUnitDocRef);
            console.log(`[FORCE LOGOUT] Removed unit ${unitId} from attachedUnit collection`);
        }

    } catch (error) {
        console.error(`[FORCE LOGOUT] Error cleaning up unit ${unitId}:`, error);
    }
}

// Cleanup civilian data
async function cleanupCivilian(civilianId) {
    if (!civilianId) return;

    try {
        // Remove from civilians collection
        const civilianDocRef = doc(db, 'civilians', civilianId);
        const civilianExists = await getDoc(civilianDocRef);
        if (civilianExists.exists()) {
            await deleteDoc(civilianDocRef);
            console.log(`[FORCE LOGOUT] Removed civilian ${civilianId} from civilians collection`);
        }

    } catch (error) {
        console.error(`[FORCE LOGOUT] Error cleaning up civilian ${civilianId}:`, error);
    }
}

// Cleanup dispatcher data
async function cleanupDispatcher(dispatcherId) {
    if (!dispatcherId) return;

    try {
        // Remove from dispatchers collection
        const dispatcherDocRef = doc(db, 'dispatchers', dispatcherId);
        const dispatcherExists = await getDoc(dispatcherDocRef);
        if (dispatcherExists.exists()) {
            await deleteDoc(dispatcherDocRef);
            console.log(`[FORCE LOGOUT] Removed dispatcher ${dispatcherId} from dispatchers collection`);
        }

    } catch (error) {
        console.error(`[FORCE LOGOUT] Error cleaning up dispatcher ${dispatcherId}:`, error);
    }
}

// Show cleanup completion message
function showCleanupMessage() {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 20px 32px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);
        z-index: 10001;
        font-size: 1.1rem;
        font-weight: 600;
        text-align: center;
        animation: fadeInOut 2s ease-in-out;
    `;

    message.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 8px;">✅</div>
        <div>Cleanup Complete</div>
        <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 4px;">Redirecting to home...</div>
    `;

    document.body.appendChild(message);

    // Add fadeInOut animation
    if (!document.getElementById('cleanup-message-styles')) {
        const style = document.createElement('style');
        style.id = 'cleanup-message-styles';
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                20%, 80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
    }

    // Remove message after animation
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 2000);
}

// Cleanup function to call when page unloads
export function cleanupForceLogout() {
    if (forceLogoutListener) {
        forceLogoutListener();
        forceLogoutListener = null;
    }
}

// Auto-cleanup on page unload
window.addEventListener('beforeunload', cleanupForceLogout);
