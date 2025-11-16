// Admin Disconnect User System
// Import force logoff function from admin.js
import { forceLogOffUser } from '../admin/admin.js';
// This file handles the admin's ability to force disconnect users

import { getFirestore, doc, deleteDoc, getDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

let db = null;

// Initialize the admin disconnect system
export function initializeAdminDisconnect(database) {
    db = database;
}

// Main disconnect function called from admin panel
export async function disconnectUser(userId, userType) {
    if (!userId || !userType) {
        console.error('[ADMIN DISCONNECT] Missing userId or userType');
        return false;
    }

    try {
        console.log(`[ADMIN DISCONNECT] Initiating disconnect for ${userType}: ${userId}`);
        
        // Show confirmation dialog
        const confirmed = await showDisconnectConfirmation(userId, userType);
        if (!confirmed) {
            console.log('[ADMIN DISCONNECT] User cancelled disconnect');
            return false;
        }

        // Show loading state
        showLoadingOverlay('Disconnecting user...');

        let success = false;

        switch (userType.toLowerCase()) {
            case 'unit':
                success = await disconnectUnit(userId);
                break;
            case 'civilian':
                success = await disconnectCivilian(userId);
                break;
            case 'dispatcher':
                success = await disconnectDispatcher(userId);
                break;
            default:
                console.error(`[ADMIN DISCONNECT] Unknown user type: ${userType}`);
                hideLoadingOverlay();
                return false;
        }

        hideLoadingOverlay();

        if (success) {
            showSuccessMessage(`${userType} ${userId} has been disconnected successfully`);
            // Refresh the user list after a brief delay
            setTimeout(() => {
                if (typeof refreshUserList === 'function') {
                    refreshUserList();
                }
            }, 1500);
        } else {
            showErrorMessage(`Failed to disconnect ${userType} ${userId}`);
        }

        return success;

    } catch (error) {
        console.error('[ADMIN DISCONNECT] Error disconnecting user:', error);
        hideLoadingOverlay();
        showErrorMessage(`Error disconnecting user: ${error.message}`);
        return false;
    }
}

// Disconnect a unit (also handles associated civilian)
async function disconnectUnit(unitId) {
    try {
        console.log(`[ADMIN DISCONNECT] Disconnecting unit: ${unitId}`);

        // First, check if unit has an associated civilian
        const unitDoc = await getDoc(doc(db, 'units', unitId));
        let associatedCivilianId = null;
        
        if (unitDoc.exists()) {
            const unitData = unitDoc.data();
            associatedCivilianId = unitData.civilianId;
            console.log(`[ADMIN DISCONNECT] Unit ${unitId} has associated civilian: ${associatedCivilianId}`);
        }

        // Remove unit from all collections
        await removeUnitFromCollections(unitId);
    // Trigger force logoff for this unit
    await forceLogOffUser(unitId, 'unit');

        // If there's an associated civilian, remove it too
        if (associatedCivilianId) {
            await removeCivilianFromCollections(associatedCivilianId);
            console.log(`[ADMIN DISCONNECT] Also removed associated civilian: ${associatedCivilianId}`);
        }

        console.log(`[ADMIN DISCONNECT] Successfully disconnected unit: ${unitId}`);
        return true;

    } catch (error) {
        console.error(`[ADMIN DISCONNECT] Error disconnecting unit ${unitId}:`, error);
        return false;
    }
}

// Disconnect a civilian (also handles associated unit if applicable)
async function disconnectCivilian(civilianId) {
    try {
        console.log(`[ADMIN DISCONNECT] Disconnecting civilian: ${civilianId}`);

        // Trigger force logoff for this civilian
        await forceLogOffUser(civilianId, 'civilian');

        // Check if civilian is associated with a unit
        const civilianDoc = await getDoc(doc(db, 'civilians', civilianId));
        let associatedUnitId = null;

        if (civilianDoc.exists()) {
            const civilianData = civilianDoc.data();
            // Check if civilian has a unitId field or look for unit with this civilian
            associatedUnitId = civilianData.unitId;
            
            // If no direct unitId, search for unit that has this civilian
            if (!associatedUnitId) {
                const unitsQuery = query(collection(db, 'units'), where('civilianId', '==', civilianId));
                const unitsSnapshot = await getDocs(unitsQuery);
                if (!unitsSnapshot.empty) {
                    associatedUnitId = unitsSnapshot.docs[0].id;
                }
            }
        }

        // Remove civilian from collections
        await removeCivilianFromCollections(civilianId);

        // If there's an associated unit, remove it too
        if (associatedUnitId) {
            await removeUnitFromCollections(associatedUnitId);
            console.log(`[ADMIN DISCONNECT] Also removed associated unit: ${associatedUnitId}`);
        }

        console.log(`[ADMIN DISCONNECT] Successfully disconnected civilian: ${civilianId}`);
        return true;

    } catch (error) {
        console.error(`[ADMIN DISCONNECT] Error disconnecting civilian ${civilianId}:`, error);
        return false;
    }
}

// Disconnect a dispatcher
async function disconnectDispatcher(dispatcherId) {
    try {
        console.log(`[ADMIN DISCONNECT] Disconnecting dispatcher: ${dispatcherId}`);

        // Remove dispatcher from dispatchers collection
        const dispatcherDocRef = doc(db, 'dispatchers', dispatcherId);
        const dispatcherExists = await getDoc(dispatcherDocRef);

        if (dispatcherExists.exists()) {
            await deleteDoc(dispatcherDocRef);
            console.log(`[ADMIN DISCONNECT] Removed dispatcher ${dispatcherId} from dispatchers collection`);
        } else {
            console.log(`[ADMIN DISCONNECT] Dispatcher ${dispatcherId} not found in collection`);
        }

        // Trigger force logoff for this dispatcher
        await forceLogOffUser(dispatcherId, 'dispatcher');

        console.log(`[ADMIN DISCONNECT] Successfully disconnected dispatcher: ${dispatcherId}`);
        return true;

    } catch (error) {
        console.error(`[ADMIN DISCONNECT] Error disconnecting dispatcher ${dispatcherId}:`, error);
        return false;
    }
}

// Remove unit from all relevant collections
async function removeUnitFromCollections(unitId) {
    const collections = ['units', 'availableUnits', 'attachedUnit'];
    
    for (const collectionName of collections) {
        try {
            const docRef = doc(db, collectionName, unitId);
            const docExists = await getDoc(docRef);
            
            if (docExists.exists()) {
                await deleteDoc(docRef);
                console.log(`[ADMIN DISCONNECT] Removed unit ${unitId} from ${collectionName} collection`);
            }
        } catch (error) {
            console.error(`[ADMIN DISCONNECT] Error removing unit ${unitId} from ${collectionName}:`, error);
        }
    }
}

// Remove civilian from all relevant collections
async function removeCivilianFromCollections(civilianId) {
    try {
        const docRef = doc(db, 'civilians', civilianId);
        const docExists = await getDoc(docRef);
        
        if (docExists.exists()) {
            await deleteDoc(docRef);
            console.log(`[ADMIN DISCONNECT] Removed civilian ${civilianId} from civilians collection`);
        }
    } catch (error) {
        console.error(`[ADMIN DISCONNECT] Error removing civilian ${civilianId}:`, error);
    }
}

// Show confirmation dialog
function showDisconnectConfirmation(userId, userType) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 0;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                overflow: hidden;
            ">
                <!-- Header -->
                <div style="
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    padding: 24px;
                    text-align: center;
                ">
                    <div style="font-size: 2.5rem; margin-bottom: 12px;">⚠️</div>
                    <h3 style="margin: 0; font-size: 1.4rem; font-weight: 700;">
                        Confirm Force Disconnect
                    </h3>
                </div>
                
                <!-- Body -->
                <div style="padding: 24px;">
                    <div style="
                        background: #fef2f2;
                        border: 2px solid #fecaca;
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 20px;
                        text-align: center;
                    ">
                        <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px;">
                            Are you sure you want to disconnect this user?
                        </div>
                        <div style="color: #7f1d1d;">
                            <strong>${userType}:</strong> ${userId}
                        </div>
                    </div>
                    
                    <div style="
                        background: #f8fafc;
                        border-radius: 6px;
                        padding: 12px;
                        font-size: 0.9rem;
                        color: #64748b;
                        margin-bottom: 20px;
                    ">
                        ⚡ This action will immediately log out the user and remove their data from all system collections.
                        ${userType === 'civilian' ? ' If associated with a unit, both will be disconnected.' : ''}
                        ${userType === 'unit' ? ' Any associated civilian will also be disconnected.' : ''}
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="
                    padding: 20px 24px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                ">
                    <button id="cancel-disconnect" style="
                        background: #f3f4f6;
                        color: #6b7280;
                        border: 2px solid #d1d5db;
                        padding: 10px 20px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">Cancel</button>
                    <button id="confirm-disconnect" style="
                        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
                    ">Force Disconnect</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('cancel-disconnect').addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });

        document.getElementById('confirm-disconnect').addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });
    });
}

// Show loading overlay
function showLoadingOverlay(message = 'Processing...') {
    const overlay = document.createElement('div');
    overlay.id = 'admin-disconnect-loading';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;

    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        ">
            <div style="
                width: 50px;
                height: 50px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #ef4444;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px auto;
            "></div>
            <div style="font-size: 1.2rem; font-weight: 600; color: #374151;">
                ${message}
            </div>
        </div>
    `;

    // Add spin animation
    if (!document.getElementById('admin-disconnect-spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'admin-disconnect-spinner-styles';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('admin-disconnect-loading');
    if (overlay) {
        overlay.remove();
    }
}

// Show success message
function showSuccessMessage(message) {
    showNotificationMessage(message, 'success');
}

// Show error message
function showErrorMessage(message) {
    showNotificationMessage(message, 'error');
}

// Generic notification message
function showNotificationMessage(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
                     type === 'error' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 
                     'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        font-weight: 600;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 3s forwards;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.2rem;">
                ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span>${message}</span>
        </div>
    `;

    // Add animation styles
    if (!document.getElementById('admin-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'admin-notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Remove after animation
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3500);
}
