import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Call this function with the user's ID to force log them off
export async function forceLogOffUser(userId, userType) {
    // Use the imported db instance from firebase.js
    try {
        let docData = { active: true };
        if (userType === 'unit') docData.unitId = userId;
        else if (userType === 'civilian') docData.civilianId = userId;
        else if (userType === 'dispatcher') docData.dispatcherId = userId;
        await setDoc(doc(db, 'forceLogOff', userId), docData);
        console.log(`[ADMIN] Force logoff triggered for ${userType}: ${userId}`);
    } catch (err) {
        console.error(`[ADMIN] Error triggering force logoff for ${userType}: ${userId}`, err);
    }
}

// Example usage: Add a button or call forceLogOffUser(unitId) when needed
// document.getElementById('forceLogOffBtn').addEventListener('click', () => {
//     const userId = ...; // get selected userId from UI
//     forceLogOffUser(userId);
// });
// admin/admin.js
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  getDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Import centralized messaging system
import { 
    initializeMessaging, 
    sendUserMessage, 
    sendMessage, 
    closeMessageModal,
    playPriorityTone,
    cleanupMessaging
} from "../messaging-system.js";

// Import admin disconnect system
import { initializeAdminDisconnect, disconnectUser } from "../firebase/adminDisconnect.js";

// Reuse status color helpers from dispatch for unit tiles
import { getStatusColor, getUnitTypeColor, getContrastingTextColor } from "../dispatch/statusColor.js";

// Initialize auth
const auth = getAuth();

// Global state
let currentTab = 'dashboard';
let autoRefreshInterval = null;
let isAutoRefresh = true;
let unsubscribeListeners = [];
let isLoadingDashboard = false;

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is authenticated
    if (!sessionStorage.getItem('adminLoggedIn')) {
        console.log('No admin session found, redirecting to index');
        window.location.href = '../index.html';
        return;
    }

    // Check if database is initialized
    if (!db) {
        console.error('Firebase database not initialized');
        showNotification('Database connection error. Please refresh the page.', 'error');
        return;
    }

    // Initialize interface
    initializeTabs();
    initializeLogout();
    
    // Initialize messaging system for admin
    initializeMessaging({
        userType: 'admin',
        userId: 'admin',
        userCallsign: 'Admin'
    });
    
    // Initialize admin disconnect system
    initializeAdminDisconnect(db);
    
    // Make disconnect function globally available for HTML buttons
    window.disconnectUser = disconnectUser;
    
    // Load dashboard with a small delay to ensure DOM is ready
    setTimeout(() => {
        loadDashboard();
        // Start real-time listeners immediately for dashboard
        if (isAutoRefresh) {
            startAutoRefresh();
        }
    }, 100);
});

// Utility Functions

function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.hasAttribute('data-initialized')) {
        logoutBtn.setAttribute('data-initialized', 'true');
        logoutBtn.addEventListener('click', async () => {
            try {
                // Clean up all listeners before logout
                unsubscribeListeners.forEach(unsubscribe => unsubscribe());
                unsubscribeListeners = [];
                
                // Stop live activity monitoring
                stopLiveActivityMonitoring();
                
                // Stop dashboard real-time listeners
                stopDashboardRealTimeListeners();
                
                // Stop auto-refresh
                stopAutoRefresh();
                
                await signOut(auth);
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Error signing out:', error);
            }
        });
    }
}

// Also cleanup on page unload
window.addEventListener('beforeunload', () => {
    unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    stopLiveActivityMonitoring();
    stopDashboardRealTimeListeners();
    cleanupMessaging();
});

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            switchTab(tabId);
        });
    });

    // Show initial tab
    switchTab('dashboard');
}

function switchTab(tabId) {
    console.log(`🔄 Switching to tab: ${tabId}`);
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Map tab IDs to content IDs (some tabs have different naming)
    let contentId = tabId;
    if (tabId === 'users') {
        contentId = 'user-management';
    } else if (tabId === 'calls') {
        contentId = 'call-management';
    } else if (tabId === 'logs') {
        contentId = 'system-logs';
    }
    
    const activeContent = document.getElementById(contentId);
    if (activeContent) {
        activeContent.classList.add('active');
    }

    // Manage real-time indicator
    if (tabId === 'dashboard') {
        setTimeout(() => addRealTimeIndicator(), 100);
        console.log('📊 Dashboard tab active - starting real-time updates');
    } else {
        removeRealTimeIndicator();
        console.log(`📋 ${tabId} tab active - real-time updates paused`);
    }

    // Load tab-specific data
    currentTab = tabId;
    loadTabData(tabId);
}

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            // Only load if not already loading
            if (!isLoadingDashboard) {
                loadDashboard();
            }
            break;
        case 'live-activity':
            loadLiveActivity();
            break;
        case 'user-management':
        case 'users':
            loadUsers();
            break;
        case 'call-management':
        case 'calls':
            loadCalls();
            break;
        case 'system-logs':
        case 'logs':
            loadLogs();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// Dashboard Functions
async function loadDashboard() {
    // Prevent multiple simultaneous loads
    if (isLoadingDashboard) {
        console.log('Dashboard already loading, skipping...');
        return;
    }
    
    try {
        isLoadingDashboard = true;
        showLoading();
        
        // Load metrics
        const [totalUsers, activeCalls, recentAlerts] = await Promise.all([
            getUserCount(),
            getActiveCallsCount(),
            getRecentAlertsCount()
        ]);

        // Update metrics with safe DOM access
        const totalUsersEl = document.getElementById('totalUsers');
        const activeCallsEl = document.getElementById('activeCalls');
        const recentAlertsEl = document.getElementById('recentAlerts');
        
        if (totalUsersEl) totalUsersEl.textContent = totalUsers;
        if (activeCallsEl) activeCallsEl.textContent = activeCalls;
        if (recentAlertsEl) recentAlertsEl.textContent = recentAlerts;

        // Load service status
        await loadServiceStatus();
        
        // Load recent activity
        await loadRecentActivity();
        
        // Only log admin access if this is a fresh login (within last 5 seconds)
        const loginTime = sessionStorage.getItem('adminLoginTime');
        if (loginTime && (Date.now() - parseInt(loginTime)) < 5000) {
            await logUserAction('Admin', 'System', 'accessed admin panel');
            // Clear login time to prevent duplicate logs
            sessionStorage.removeItem('adminLoginTime');
        }

        hideLoading();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading dashboard data', 'error');
        hideLoading();
    } finally {
        isLoadingDashboard = false;
    }
}

async function getUserCount() {
    try {
        if (!db) {
            console.warn('Database not initialized');
            return 5; // Demo fallback
        }
        
        // Count all non-placeholder users from all collections
        let totalUsers = 0;
        
        // Count units (excluding placeholders)
        const unitsRef = collection(db, 'units');
        const unitsSnapshot = await getDocs(unitsRef);
        let nonPlaceholderUnits = 0;
        unitsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.placeholder !== true) {
                nonPlaceholderUnits++;
            }
        });
        totalUsers += nonPlaceholderUnits;
        
        // Count dispatchers (excluding placeholders)
        const dispatchersRef = collection(db, 'dispatchers');
        const dispatchersSnapshot = await getDocs(dispatchersRef);
        let nonPlaceholderDispatchers = 0;
        dispatchersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.placeholder !== true) {
                nonPlaceholderDispatchers++;
            }
        });
        totalUsers += nonPlaceholderDispatchers;
        
        // Count civilians (excluding placeholders)
        const civiliansRef = collection(db, 'civilians');
        const civiliansSnapshot = await getDocs(civiliansRef);
        let nonPlaceholderCivilians = 0;
        civiliansSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.placeholder !== true) {
                nonPlaceholderCivilians++;
            }
        });
        totalUsers += nonPlaceholderCivilians;
        
        console.log(`Total users: ${nonPlaceholderUnits} units + ${nonPlaceholderDispatchers} dispatchers + ${nonPlaceholderCivilians} civilians = ${totalUsers}`);
        
        return totalUsers || 5; // Fallback to demo value
    } catch (error) {
        console.error('Error getting user count:', error);
        // Return demo data for now
        return 5;
    }
}

async function getActiveCallsCount() {
    try {
        if (!db) {
            console.warn('Database not initialized');
            return 3; // Demo fallback
        }
        const callsRef = collection(db, 'calls');
        // Get all calls and subtract the 12 placeholders
        const snapshot = await getDocs(callsRef);
        const totalCalls = snapshot.size;
        const actualCalls = Math.max(0, totalCalls - 12); // Subtract 12 placeholder calls
        console.log(`Active calls: ${totalCalls} total - 12 placeholders = ${actualCalls} actual calls`);
        return actualCalls;
    } catch (error) {
        console.error('Error getting active calls count:', error);
        return 3; // Demo fallback
    }
}

async function getRecentAlertsCount() {
    try {
        if (!db) {
            console.warn('Database not initialized');
            return 0;
        }
        // Get recent alerts from last 24 hours
        const alertsRef = collection(db, 'alerts');
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const q = query(alertsRef, where('timestamp', '>=', twentyFourHoursAgo));
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting recent alerts count:', error);
        return 3; // Return demo value on error
    }
}

// Debounce mechanism for service status loading
let serviceStatusLoadTimeout = null;

function debouncedLoadServiceStatus() {
    if (serviceStatusLoadTimeout) {
        clearTimeout(serviceStatusLoadTimeout);
    }
    
    serviceStatusLoadTimeout = setTimeout(() => {
        loadServiceStatus();
    }, 300); // Wait 300ms before loading to prevent duplicate calls
}

async function loadServiceStatus() {
    const services = ['police', 'fire', 'ambulance', 'dispatch', 'civilian'];
    const serviceContainer = document.querySelector('#serviceGrid');
    
    if (!serviceContainer) {
        console.warn('Service grid container not found');
        return;
    }
    
    // Check if already loading to prevent duplicates
    if (serviceContainer.classList.contains('loading')) {
        console.log('Service status already loading, skipping...');
        return;
    }
    
    // Mark as loading
    serviceContainer.classList.add('loading');
    
    // Clear previous content
    serviceContainer.innerHTML = '';
    
    console.log('Loading service status...');
    
    // First, calculate all service users (non-civilians)
    let totalServiceUsers = 0;
    const serviceCounts = {};
    
    // Calculate service counts first (excluding civilians)
    const nonCivilianServices = ['police', 'fire', 'ambulance', 'dispatch'];
    
    for (const service of nonCivilianServices) {
        try {
            let count = 0;
            
            if (db) {
                if (service === 'dispatch') {
                    // Check dispatchers collection - exclude placeholders
                    const dispatchersRef = collection(db, 'dispatchers');
                    const dispatcherSnapshot = await getDocs(dispatchersRef);
                    
                    // Filter out placeholders in JavaScript
                    let nonPlaceholderCount = 0;
                    dispatcherSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.placeholder !== true) {
                            nonPlaceholderCount++;
                        }
                    });
                    
                    count = nonPlaceholderCount;
                    console.log(`Found ${count} active dispatchers (excluding placeholders)`);
                } else {
                    // For police, fire, ambulance - check units collection
                    const unitsRef = collection(db, 'units');
                    const serviceMapping = {
                        'police': 'Police',
                        'fire': 'Fire',
                        'ambulance': 'Ambulance'
                    };
                    
                    const unitType = serviceMapping[service];
                    if (unitType) {
                        const unitsRef = collection(db, 'units');
                        const serviceQuery = query(unitsRef, where('unitType', '==', unitType));
                        const snapshot = await getDocs(serviceQuery);
                        
                        // Filter out placeholders in JavaScript
                        let nonPlaceholderCount = 0;
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            if (data.placeholder !== true) {
                                nonPlaceholderCount++;
                            }
                        });
                        
                        count = nonPlaceholderCount;
                        console.log(`Found ${count} ${service} units (excluding placeholders)`);
                    }
                }
            }
            
            serviceCounts[service] = count;
            totalServiceUsers += count;
            
        } catch (error) {
            console.error(`Error loading ${service} status:`, error);
            serviceCounts[service] = 0;
        }
    }
    
    // Now calculate civilians (total civilians minus service users)
    try {
        let civilianCount = 0;
        if (db) {
            const civiliansRef = collection(db, 'civilians');
            const civilianSnapshot = await getDocs(civiliansRef);
            
            // Filter out placeholders in JavaScript
            let nonPlaceholderCivilians = 0;
            civilianSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.placeholder !== true) {
                    nonPlaceholderCivilians++;
                }
            });
            
            civilianCount = Math.max(0, nonPlaceholderCivilians - totalServiceUsers);
            console.log(`Civilians: ${nonPlaceholderCivilians} total - ${totalServiceUsers} service users = ${civilianCount} actual civilians`);
        }
        serviceCounts['civilian'] = civilianCount;
    } catch (error) {
        console.error('Error loading civilian status:', error);
        serviceCounts['civilian'] = 0;
    }
    
    // Now display all services in the correct order
    for (const service of services) {
        const count = serviceCounts[service] || 0;
        
        const serviceElement = document.createElement('div');
        serviceElement.className = 'service-status';
        serviceElement.innerHTML = `
            <div class="service-icon">${getServiceIcon(service)}</div>
            <div class="service-name">${service.charAt(0).toUpperCase() + service.slice(1)}</div>
            <div class="service-count">${count}</div>
        `;
        
        serviceContainer.appendChild(serviceElement);
    }
    
    // Remove loading state
    serviceContainer.classList.remove('loading');
    console.log('✅ Service status loaded successfully');
}

function getServiceIcon(service) {
    const icons = {
        police: '👮',
        fire: '🚒',
        ambulance: '🚑',
        dispatch: '📞',
        civilian: '👤',
        system: '🔧',
        admin: '🔐'
    };
    return icons[service] || '❓';
}

async function loadRecentActivity() {
    try {
        const activityFeed = document.getElementById('recentActivityFeed');
        
        if (!activityFeed) {
            console.warn('Activity feed element not found');
            return;
        }

        if (!db) {
            activityFeed.innerHTML = '<div class="activity-item">Database not connected</div>';
            return;
        }
        
        // Set up real-time listener for logs collection (the actual logs from the system)
        const logsRef = collection(db, 'logs');
        const recentQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(5));
        // Use onSnapshot for real-time updates
        const unsubscribe = onSnapshot(recentQuery, (snapshot) => {
            activityFeed.innerHTML = '';
            
            if (snapshot.empty) {
                activityFeed.innerHTML = `
                    <div class="activity-item">
                        <div class="activity-time">-</div>
                        <div class="activity-text">No recent activity found</div>
                        <div class="activity-user">System</div>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'activity-item';
                
                // Handle timestamp (could be Firestore Timestamp or Date)
                let timestamp;
                if (data.timestamp?.toDate) {
                    timestamp = data.timestamp.toDate();
                } else if (data.timestamp instanceof Date) {
                    timestamp = data.timestamp;
                } else {
                    timestamp = new Date();
                }
                
                const timeString = timestamp.toLocaleTimeString();
                
                // Format the activity message using real log data
                const serviceIcon = getServiceIcon(data.serviceType?.toLowerCase() || 'system');
                const callsign = data.callsign && data.callsign !== 'N/A' ? data.callsign : data.serviceId || 'Unknown';
                const userName = data.discordName || data.irlName || callsign;
                
                let activityText = '';
                if (data.action && data.details) {
                    activityText = `${serviceIcon} ${data.action}: ${data.details}`;
                } else if (data.action) {
                    activityText = `${serviceIcon} ${data.action}`;
                } else {
                    activityText = `${serviceIcon} Activity logged`;
                }
                
                item.innerHTML = `
                    <div class="activity-time">${timeString}</div>
                    <div class="activity-text">${activityText}</div>
                    <div class="activity-user">${userName}</div>
                `;
                
                activityFeed.appendChild(item);
            });
        }, (error) => {
            console.error('Error in real-time activity listener:', error);
            activityFeed.innerHTML = `
                <div class="activity-item">
                    <div class="activity-time">Error</div>
                    <div class="activity-text">Failed to load recent activity</div>
                    <div class="activity-user">System</div>
                </div>
            `;
        });
        
        // Store the unsubscribe function to clean up later
        unsubscribeListeners.push(unsubscribe);
    } catch (error) {
        console.error('Error loading recent activity:', error);
        const activityFeed = document.getElementById('recentActivityFeed');
        if (activityFeed) {
            activityFeed.innerHTML = '<div class="activity-item">Error loading activity</div>';
        }
    }
}

// Live Activity Functions
// Live Activity Functions
let liveActivityListener = null;
let isPaused = false;
let isAutoRefreshEnabled = true;

function loadLiveActivity() {
    console.log('Loading Live Activity Monitor...');
    
    // Initialize controls
    initializeLiveActivityControls();
    
    // Start real-time monitoring if not paused
    if (!isPaused) {
        startLiveActivityMonitoring();
    }
}

function initializeLiveActivityControls() {
    // Pause/Resume button
    const pauseBtn = document.getElementById('pauseActivityBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', togglePause);
        updatePauseButton();
    }
    
    // Clear button
    const clearBtn = document.getElementById('clearActivityBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearLiveActivityFeed);
    }
    
    // Auto-refresh toggle
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    if (autoRefreshToggle) {
        autoRefreshToggle.checked = isAutoRefreshEnabled;
        autoRefreshToggle.addEventListener('change', (e) => {
            isAutoRefreshEnabled = e.target.checked;
            if (isAutoRefreshEnabled && !isPaused) {
                startLiveActivityMonitoring();
            } else if (!isAutoRefreshEnabled) {
                stopLiveActivityMonitoring();
            }
        });
    }
    
    // Filter controls
    setupActivityFilters();
}

function startLiveActivityMonitoring() {
    const feed = document.getElementById('liveActivityFeed');
    if (!feed) {
        console.warn('Live activity feed element not found');
        return;
    }

    if (!db) {
        feed.innerHTML = '<div class="activity-item"><div class="activity-text">Database not connected</div></div>';
        return;
    }

    // Stop existing listener if any
    stopLiveActivityMonitoring();

    console.log('Starting real-time activity monitoring...');
    
    // Set up real-time listener for logs collection
    const logsRef = collection(db, 'logs');
    const liveQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
    
    liveActivityListener = onSnapshot(liveQuery, (snapshot) => {
        if (isPaused) return; // Don't update if paused
        
        feed.innerHTML = '';
        
        if (snapshot.empty) {
            feed.innerHTML = `
                <div class="activity-item">
                    <div class="activity-time">-</div>
                    <div class="activity-text">No activity logs found</div>
                    <div class="activity-details">Waiting for system activity...</div>
                </div>
            `;
            return;
        }
        
        let displayCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Apply filters
            if (!passesFilters(data)) return;
            
            displayCount++;
            if (displayCount > 50) return; // Limit display to 50 items
            
            const item = document.createElement('div');
            item.className = 'activity-item';
            
            // Handle timestamp
            let timestamp;
            if (data.timestamp?.toDate) {
                timestamp = data.timestamp.toDate();
            } else if (data.timestamp instanceof Date) {
                timestamp = data.timestamp;
            } else {
                timestamp = new Date();
            }
            
            const timeString = timestamp.toLocaleTimeString();
            const dateString = timestamp.toLocaleDateString();
            
            // Format comprehensive activity display
            const serviceIcon = getServiceIcon(data.serviceType?.toLowerCase() || 'system');
            const serviceType = data.serviceType || 'System';
            const action = data.action || 'Unknown Action';
            const details = data.details || '';
            const callsign = data.callsign && data.callsign !== 'N/A' ? data.callsign : '';
            const discordName = data.discordName || '';
            const irlName = data.irlName || '';
            const serviceId = data.serviceId || '';
            
            // Build user display
            let userDisplay = 'Unknown User';
            if (callsign && callsign !== 'N/A') {
                userDisplay = callsign;
            } else if (discordName) {
                userDisplay = discordName;
            } else if (irlName) {
                userDisplay = irlName;
            } else if (serviceId) {
                userDisplay = serviceId;
            }
            
            // Build action text
            let actionText = `${serviceIcon} ${action}`;
            if (details) {
                actionText += `: ${details}`;
            }
            
            // Build details text
            let detailsText = `${serviceType}`;
            if (userDisplay !== 'Unknown User') {
                detailsText += ` • ${userDisplay}`;
            }
            if (data.unitId && data.unitId !== 'N/A') {
                detailsText += ` • Unit: ${data.unitId}`;
            }
            if (data.dispatcherID && data.dispatcherID !== 'N/A') {
                detailsText += ` • Dispatcher: ${data.dispatcherID}`;
            }
            if (data.civilianId && data.civilianId !== 'N/A') {
                detailsText += ` • Civilian: ${data.civilianId}`;
            }
            
            item.innerHTML = `
                <div class="activity-time" title="${dateString}">${timeString}</div>
                <div class="activity-text">${actionText}</div>
                <div class="activity-details">${detailsText}</div>
                <div class="activity-service-badge ${serviceType.toLowerCase()}">${serviceType}</div>
            `;
            
            feed.appendChild(item);
        });
        
        // Update status
        const statusElement = document.querySelector('.live-activity-status');
        if (statusElement) {
            statusElement.textContent = `Showing ${displayCount} activities • Live`;
        }
        
    }, (error) => {
        console.error('Error in live activity listener:', error);
        feed.innerHTML = `
            <div class="activity-item error">
                <div class="activity-time">Error</div>
                <div class="activity-text">Failed to load live activity</div>
                <div class="activity-details">${error.message}</div>
            </div>
        `;
    });
}

function stopLiveActivityMonitoring() {
    if (liveActivityListener) {
        console.log('Stopping live activity monitoring...');
        liveActivityListener();
        liveActivityListener = null;
    }
}

function togglePause() {
    isPaused = !isPaused;
    console.log(`Live activity ${isPaused ? 'paused' : 'resumed'}`);
    
    if (isPaused) {
        stopLiveActivityMonitoring();
    } else if (isAutoRefreshEnabled) {
        startLiveActivityMonitoring();
    }
    
    updatePauseButton();
}

function updatePauseButton() {
    const pauseBtn = document.getElementById('pauseActivityBtn');
    if (pauseBtn) {
        pauseBtn.innerHTML = isPaused ? '▶️ Resume' : '⏸️ Pause';
        pauseBtn.className = isPaused ? 'control-btn primary' : 'control-btn';
    }
}

function clearLiveActivityFeed() {
    const feed = document.getElementById('liveActivityFeed');
    if (feed) {
        feed.innerHTML = `
            <div class="activity-item cleared">
                <div class="activity-time">${new Date().toLocaleTimeString()}</div>
                <div class="activity-text">Activity feed cleared</div>
                <div class="activity-details">Monitoring continues...</div>
            </div>
        `;
    }
    
    // Clear console as well
    console.clear();
    console.log('Live Activity Monitor - Feed cleared');
}

function setupActivityFilters() {
    const serviceFilter = document.getElementById('serviceFilter');
    const actionFilter = document.getElementById('actionFilter');
    const searchInput = document.getElementById('activitySearch');
    
    if (serviceFilter) {
        serviceFilter.addEventListener('change', applyFilters);
    }
    
    if (actionFilter) {
        actionFilter.addEventListener('change', applyFilters);
    }
    
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 300);
        });
    }
}

function passesFilters(data) {
    const serviceFilter = document.getElementById('serviceFilter')?.value || '';
    const actionFilter = document.getElementById('actionFilter')?.value || '';
    const searchQuery = document.getElementById('activitySearch')?.value.toLowerCase() || '';
    
    // Service filter
    if (serviceFilter && data.serviceType !== serviceFilter) {
        return false;
    }
    
    // Action filter
    if (actionFilter && !data.action?.includes(actionFilter)) {
        return false;
    }
    
    // Search filter
    if (searchQuery) {
        const searchText = `
            ${data.action || ''}
            ${data.details || ''}
            ${data.serviceType || ''}
            ${data.callsign || ''}
            ${data.discordName || ''}
            ${data.irlName || ''}
        `.toLowerCase();
        
        if (!searchText.includes(searchQuery)) {
            return false;
        }
    }
    
    return true;
}

function applyFilters() {
    // Restart monitoring to apply filters
    if (!isPaused && isAutoRefreshEnabled) {
        startLiveActivityMonitoring();
    }
}

// User Management Functions
async function loadUsers() {
    try {
        showLoading();
        console.log('Loading users from all collections...');
        
        if (!db) {
            console.warn('Database not initialized');
            const tbody = document.getElementById('usersTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Database not connected</td></tr>';
            }
            hideLoading();
            return;
        }
        
        // Setup real-time listener for user data
        setupUsersListener();
        
        // Debug collections to see what data we have
        console.log('Debugging collections to check for dispatchers and civilians...');
        await window.debugCollections();
        
        hideLoading();
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Error loading users', 'error');
        hideLoading();
    }
}

// Store enhanced users globally so we can access them in viewUserDetails
let currentEnhancedUsers = [];
let usersListenerActive = false; // Flag to prevent duplicate listeners

async function setupUsersListener() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) {
        console.warn('Users table body not found');
        return;
    }
    
    // Prevent duplicate listeners
    if (usersListenerActive) {
        console.log('🔄 Users listener already active, skipping setup');
        return;
    }
    
    try {
        console.log('🔄 Setting up real-time users listener...');
        usersListenerActive = true;
        
        // Clean up any existing user listeners first
        if (window.userListeners) {
            window.userListeners.forEach(unsubscribe => {
                try {
                    unsubscribe();
                } catch (error) {
                    console.warn('Error unsubscribing user listener:', error);
                }
            });
        }
        window.userListeners = [];
        
        // Set up real-time listeners for all user collections
        const userCollections = ['units', 'dispatchers', 'civilians'];
        
        // Debounce mechanism to prevent rapid updates
        let updateTimeout = null;
        
        const updateUsersTable = async () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            
            updateTimeout = setTimeout(async () => {
                console.log('📊 User data changed, updating table...');
                
                // Get all user data from different collections
            const allUsers = [];
            
            // Get units (Police, Fire, Ambulance)
            const unitsRef = collection(db, 'units');
            const unitsSnapshot = await getDocs(unitsRef);
            
            unitsSnapshot.forEach(doc => {
                const data = doc.data();
                
                // Skip placeholder entries
                if (data.placeholder === true) {
                    return;
                }
                
                allUsers.push({
                    id: doc.id,
                    username: data.callsign || 'Unit',
                    service: data.unitType || 'Unknown',
                    status: data.status || 'Unknown',
                    callsign: data.callsign || 'N/A',
                    lastActive: data.timestamp || null,
                    type: 'unit',
                    userId: data.userId || data.playerId || data.userRef || null,
                    rawData: data
                });
            });
            
            // Get dispatchers
            const dispatchersRef = collection(db, 'dispatchers');
            const dispatchersSnapshot = await getDocs(dispatchersRef);
            
            dispatchersSnapshot.forEach(doc => {
                const data = doc.data();
                
                // Skip placeholder entries
                if (data.placeholder === true) {
                    return;
                }
                
                allUsers.push({
                    id: doc.id,
                    username: `Dispatcher ${doc.id.slice(-8)}`,
                    service: 'Dispatch',
                    status: 'Active',
                    callsign: doc.id.slice(-8),
                    lastActive: data.startedAt || null,
                    type: 'dispatcher',
                    userId: data.userId || data.playerId || data.userRef || null,
                    rawData: data
                });
            });
            
            // Get civilians
            const civiliansRef = collection(db, 'civilians');
            const civiliansSnapshot = await getDocs(civiliansRef);
            
            civiliansSnapshot.forEach(doc => {
                const data = doc.data();
                
                // Skip placeholder entries
                if (data.placeholder === true) {
                    return;
                }
                
                const fullName = `${data.firstName || data.firstname || ''} ${data.lastName || data.lastname || ''}`.trim();
                
                allUsers.push({
                    id: doc.id,
                    username: fullName || `Civilian ${doc.id.slice(-6)}`,
                    service: 'Civilian',
                    status: 'Active',
                    callsign: doc.id,
                    lastActive: data.timestamp || null,
                    type: 'civilian',
                    userId: data.userId || data.playerId || data.userRef || null,
                    rawData: data
                });
            });
            
            // Create a map of civilians for enhancement
            const civiliansMap = new Map();
            allUsers.filter(user => user.type === 'civilian').forEach(civilian => {
                civiliansMap.set(civilian.id, civilian);
            });
            
            // Enhance user data
            const enhancedUsers = await enhanceUserDataSimple(allUsers, civiliansMap);
            
            // Filter valid users
            const validUsers = enhancedUsers.filter(user => {
                return user.username && user.service;
            });
            
            // Store enhanced users globally
            currentEnhancedUsers = validUsers;
            
            // Update table
            updateUsersTableDisplay(validUsers);
            
            console.log(`✅ Users table updated with ${validUsers.length} users`);
            }, 300); // 300ms debounce delay
        };
        
        // Set up listeners for each collection
        userCollections.forEach(collectionName => {
            const collectionRef = collection(db, collectionName);
            const listener = onSnapshot(collectionRef, (snapshot) => {
                console.log(`📊 ${collectionName} collection updated`);
                updateUsersTable();
            }, (error) => {
                console.error(`Error in ${collectionName} listener:`, error);
            });
            
            window.userListeners.push(listener);
        });
        
        // Initial load
        await updateUsersTable();
        
    } catch (error) {
        console.error('Error setting up users listener:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Error loading users</td></tr>';
        usersListenerActive = false; // Reset flag on error
    }
}

// Function to cleanup user listeners
function cleanupUserListeners() {
    if (window.userListeners) {
        window.userListeners.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (error) {
                console.warn('Error unsubscribing user listener:', error);
            }
        });
        window.userListeners = [];
    }
    usersListenerActive = false;
    console.log('🧹 User listeners cleaned up');
}

// Separate function to update the users table display
function updateUsersTableDisplay(validUsers) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    // Clear table
    tbody.innerHTML = '';
    
    if (validUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No users found in any collection</td></tr>';
        return;
    }
    
    // Sort users by service and then by username
    validUsers.sort((a, b) => {
        if (a.service !== b.service) {
            return a.service.localeCompare(b.service);
        }
        return a.username.localeCompare(b.username);
    });
    
    // Add visual indicator for real-time updates
    tbody.style.transition = 'opacity 0.3s ease';
    tbody.style.opacity = '0.7';
    
    setTimeout(() => {
        // Populate table
        validUsers.forEach(user => {
            const row = document.createElement('tr');
            row.className = 'user-row';
            row.dataset.service = user.service.toLowerCase();
            
            // Format last active time
            let lastActiveText = 'Never';
            if (user.lastActive) {
                let date;
                if (user.lastActive.toDate) {
                    date = user.lastActive.toDate();
                } else if (user.lastActive instanceof Date) {
                    date = user.lastActive;
                } else {
                    date = new Date(user.lastActive);
                }
                
                const timeDiff = Date.now() - date.getTime();
                if (timeDiff < 60000) {
                    lastActiveText = 'Just now';
                } else if (timeDiff < 3600000) {
                    lastActiveText = `${Math.floor(timeDiff / 60000)}m ago`;
                } else if (timeDiff < 86400000) {
                    lastActiveText = `${Math.floor(timeDiff / 3600000)}h ago`;
                } else {
                    lastActiveText = date.toLocaleDateString();
                }
            }
            
            // Determine online status (active within last 10 minutes)
            const isOnline = user.lastActive && 
                ((user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive)).getTime() > Date.now() - 600000);
            
            const statusBadge = isOnline ? 
                `<span class="status-badge online">${user.status}</span>` : 
                `<span class="status-badge offline">${user.status}</span>`;
            
            // Service icon
            const serviceIcon = getServiceIcon(user.service.toLowerCase());
            
            // Build enhanced username display
            let usernameDisplay = user.username;
            let enhancedBadge = '';
            let civilianInfo = '';
            
            if (user.enhanced && (user.discordName || user.irlName)) {
                const realNames = [];
                if (user.discordName) realNames.push(`Discord: ${user.discordName}`);
                if (user.irlName) realNames.push(`IRL: ${user.irlName}`);
                
                usernameDisplay = `${user.username}`;
                enhancedBadge = `<span class="enhanced-badge" title="Enhanced from ${user.enhancedFrom || 'logs'}: ${realNames.join(', ')}">✓</span>`;
            }
            
            // Add civilian association info for units
            if (user.type === 'unit' && user.hasAssociation && user.civilianName) {
                civilianInfo = `<div class="civilian-association" title="Associated Civilian: ${user.civilianName} (${user.civilianId})">
                    <span class="civilian-badge">👤 ${user.civilianName}</span>
                </div>`;
            } else if (user.type === 'unit') {
                civilianInfo = `<div class="civilian-association">
                    <span class="civilian-badge unknown" title="No civilian association found">👤 Unknown Civilian</span>
                </div>`;
            }
            
            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <div class="user-info-main">
                            <span class="service-icon">${serviceIcon}</span>
                            <span class="username">${usernameDisplay}</span>
                            ${enhancedBadge}
                        </div>
                        ${user.enhanced && (user.discordName || user.irlName) ? `<div class="user-details-preview" title="Enhanced user data">💬 ${user.discordName || user.irlName}</div>` : ''}
                        ${civilianInfo}
                    </div>
                </td>
                <td><span class="service-tag ${user.service.toLowerCase()}">${user.service}</span></td>
                <td>${statusBadge}</td>
                <td><code class="callsign">${user.callsign}</code></td>
                <td><span class="last-active" title="${user.lastActive ? (user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive)).toLocaleString() : 'Never'}">${lastActiveText}</span></td>
                <td class="actions">
                    <button class="control-btn small" onclick="viewUserDetails('${user.id}', '${user.type}')">👁️ View</button>
                    <button class="control-btn small warning" onclick="sendUserMessage('${user.id}', '${user.username}')">💬 Message</button>
                    <button class="control-btn small danger" onclick="disconnectUser('${user.id}', '${user.type}')">🚫 Disconnect</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Restore opacity
        tbody.style.opacity = '1';
        
        // Update user count
        updateUserCount(validUsers.length);
        
        // Setup filtering
        setupUserFiltering();
        
        // Add update indicator to header
        const userManagementHeader = document.querySelector('#user-management .section-header h3');
        if (userManagementHeader) {
            // Flash green to indicate update
            userManagementHeader.style.transition = 'color 0.3s ease';
            userManagementHeader.style.color = '#28a745';
            setTimeout(() => {
                userManagementHeader.style.color = '';
            }, 1000);
        }
        
    }, 100);
}

// Simplified approach to link units with civilians
async function enhanceUserDataSimple(users, civiliansMap) {
    console.log('Using simplified approach to enhance user data...');
    
    try {
        // Get recent logs for Discord/IRL names only
        const logsRef = collection(db, 'logs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(500));
        const logsSnapshot = await getDocs(logsQuery);
        
        console.log(`Found ${logsSnapshot.size} log entries to search for user data`);
        
        // Build a simple map of callsigns to names from logs
        const userNamesMap = new Map();
        
        logsSnapshot.forEach(doc => {
            const logData = doc.data();
            
            // Only store if we have both callsign and at least one name
            if (logData.callsign && (logData.discordName || logData.irlName)) {
                const key = logData.callsign;
                
                // Keep the most recent entry for each callsign
                if (!userNamesMap.has(key) || 
                    (logData.timestamp && userNamesMap.get(key).timestamp && 
                     logData.timestamp.toDate() > userNamesMap.get(key).timestamp.toDate())) {
                    
                    userNamesMap.set(key, {
                        discordName: logData.discordName || null,
                        irlName: logData.irlName || null,
                        timestamp: logData.timestamp
                    });
                }
            }
        });
        
        console.log(`Built names map with ${userNamesMap.size} entries`);
        
        // Enhance users with the data we can reliably find
        const enhancedUsers = users.map(user => {
            const enhancedUser = { ...user, rawData: user.rawData };
            
            // Add Discord/IRL names if found in logs
            const userNames = userNamesMap.get(user.callsign);
            if (userNames) {
                enhancedUser.discordName = userNames.discordName;
                enhancedUser.irlName = userNames.irlName;
                enhancedUser.enhanced = true;
                enhancedUser.enhancedFrom = 'logs';
                console.log(`Enhanced ${user.username} with names from logs`);
            }
            
            // For units, try simple civilian association methods
            if (user.type === 'unit') {
                let associatedCivilian = null;
                
                // Method 1: Direct ID match (if unit document ID matches civilian document ID)
                if (civiliansMap.has(user.id)) {
                    associatedCivilian = civiliansMap.get(user.id);
                    console.log(`Unit ${user.callsign} linked to civilian via direct ID match`);
                }
                
                // Method 2: Look for civilian with same Discord/IRL name (if we have names)
                if (!associatedCivilian && (enhancedUser.discordName || enhancedUser.irlName)) {
                    for (const [civilianId, civilian] of civiliansMap) {
                        const civilianNames = userNamesMap.get(civilianId) || userNamesMap.get(civilian.callsign);
                        if (civilianNames) {
                            if ((enhancedUser.discordName && civilianNames.discordName === enhancedUser.discordName) ||
                                (enhancedUser.irlName && civilianNames.irlName === enhancedUser.irlName)) {
                                associatedCivilian = civilian;
                                console.log(`Unit ${user.callsign} linked to civilian via name match`);
                                break;
                            }
                        }
                    }
                }
                
                // Method 3: Fallback - try to match by similar timing (created around same time)
                if (!associatedCivilian && user.rawData.timestamp) {
                    const unitTime = user.rawData.timestamp.toDate ? user.rawData.timestamp.toDate() : new Date(user.rawData.timestamp);
                    
                    for (const [civilianId, civilian] of civiliansMap) {
                        if (civilian.rawData.timestamp) {
                            const civilianTime = civilian.rawData.timestamp.toDate ? civilian.rawData.timestamp.toDate() : new Date(civilian.rawData.timestamp);
                            const timeDiff = Math.abs(unitTime.getTime() - civilianTime.getTime());
                            
                            // If created within 5 minutes of each other, likely the same person
                            if (timeDiff < 300000) { // 5 minutes in milliseconds
                                associatedCivilian = civilian;
                                console.log(`Unit ${user.callsign} linked to civilian via timestamp proximity`);
                                break;
                            }
                        }
                    }
                }
                
                // Add civilian association if found
                if (associatedCivilian) {
                    const firstName = associatedCivilian.rawData?.firstName || associatedCivilian.rawData?.firstname || '';
                    const lastName = associatedCivilian.rawData?.lastName || associatedCivilian.rawData?.lastname || '';
                    
                    enhancedUser.associatedCivilian = associatedCivilian;
                    enhancedUser.civilianName = `${firstName} ${lastName}`.trim() || 'Unknown Name';
                    enhancedUser.civilianId = associatedCivilian.id;
                    enhancedUser.hasAssociation = true;
                    
                    console.log(`Unit ${user.callsign} associated with civilian: ${enhancedUser.civilianName}`);
                }
            }
            
            return enhancedUser;
        });
        
        const enhancedCount = enhancedUsers.filter(u => u.enhanced).length;
        const unitCivilianLinks = enhancedUsers.filter(u => u.type === 'unit' && u.hasAssociation).length;
        
        console.log(`Enhanced ${enhancedCount}/${users.length} users with names from logs`);
        console.log(`Linked ${unitCivilianLinks} units with civilian identities using simplified methods`);
        
        return enhancedUsers;
        
    } catch (error) {
        console.error('Error in simplified user enhancement:', error);
        return users; // Return original users if enhancement fails
    }
}

// Enhanced function to link units with civilians and add Discord/IRL names
async function enhanceUserDataWithCivilians(users, civiliansMap) {
    console.log('Enhancing user data with civilian associations and logs data...');
    
    try {
        // Get recent logs to find Discord/IRL names for each user
        const logsRef = collection(db, 'logs');
        // Get recent logs (last 1000 entries should be enough to catch recent logins)
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(1000));
        const logsSnapshot = await getDocs(logsQuery);
        
        console.log(`Found ${logsSnapshot.size} log entries to search for user data`);
        
        // Build a map of callsigns/IDs to user details from logs
        const userDetailsMap = new Map();
        
        logsSnapshot.forEach(doc => {
            const logData = doc.data();
            
            // Look for logs that contain both callsign/ID and Discord/IRL names
            if (logData.callsign && (logData.discordName || logData.irlName)) {
                const key = logData.callsign;
                
                // Store the most recent user details for this callsign
                if (!userDetailsMap.has(key) || 
                    (logData.timestamp && userDetailsMap.get(key).timestamp && 
                     logData.timestamp.toDate() > userDetailsMap.get(key).timestamp.toDate())) {
                    
                    userDetailsMap.set(key, {
                        discordName: logData.discordName || null,
                        irlName: logData.irlName || null,
                        serviceType: logData.serviceType || null,
                        unitId: logData.unitId || null,
                        civilianId: logData.civilianId || null,
                        dispatcherID: logData.dispatcherID || null,
                        timestamp: logData.timestamp
                    });
                    
                    console.log(`Found user details for ${key}:`, userDetailsMap.get(key));
                }
            }
            
            // Also check by unitId, civilianId, dispatcherID if they exist
            ['unitId', 'civilianId', 'dispatcherID'].forEach(idField => {
                if (logData[idField] && (logData.discordName || logData.irlName)) {
                    const key = logData[idField];
                    
                    if (!userDetailsMap.has(key) || 
                        (logData.timestamp && userDetailsMap.get(key).timestamp && 
                         logData.timestamp.toDate() > userDetailsMap.get(key).timestamp.toDate())) {
                        
                        userDetailsMap.set(key, {
                            discordName: logData.discordName || null,
                            irlName: logData.irlName || null,
                            serviceType: logData.serviceType || null,
                            unitId: logData.unitId || null,
                            civilianId: logData.civilianId || null,
                            dispatcherID: logData.dispatcherID || null,
                            timestamp: logData.timestamp
                        });
                        
                        console.log(`Found user details for ${idField} ${key}:`, userDetailsMap.get(key));
                    }
                }
            });
        });
        
        console.log(`Built user details map with ${userDetailsMap.size} entries`);
        
        // Enhance each user with details from logs and civilian associations
        const enhancedUsers = users.map(user => {
            let userDetails = null;
            let associatedCivilian = null;
            
            // Try to find user details by various identifiers
            const searchKeys = [
                user.callsign,     // Try callsign first
                user.id,           // Try document ID
                user.username      // Try username
            ];
            
            for (const key of searchKeys) {
                if (key && userDetailsMap.has(key)) {
                    userDetails = userDetailsMap.get(key);
                    break;
                }
            }
            
            // For units, try to find associated civilian
            if (user.type === 'unit') {
                // Method 1: Check if userDetails contains a civilianId
                if (userDetails && userDetails.civilianId) {
                    associatedCivilian = civiliansMap.get(userDetails.civilianId);
                    console.log(`Unit ${user.callsign} linked to civilian via logs: ${userDetails.civilianId}`);
                }
                
                // Method 2: Try to find civilian by matching Discord/IRL names
                if (!associatedCivilian && userDetails && (userDetails.discordName || userDetails.irlName)) {
                    for (const [civilianId, civilian] of civiliansMap) {
                        // Check if civilian has matching Discord/IRL name from logs
                        const civilianDetails = userDetailsMap.get(civilianId) || userDetailsMap.get(civilian.callsign);
                        if (civilianDetails && 
                            ((userDetails.discordName && civilianDetails.discordName === userDetails.discordName) ||
                             (userDetails.irlName && civilianDetails.irlName === userDetails.irlName))) {
                            associatedCivilian = civilian;
                            console.log(`Unit ${user.callsign} linked to civilian via name match: ${civilianId}`);
                            break;
                        }
                    }
                }
                
                // Method 3: Try to find civilian by userId field if it exists
                if (!associatedCivilian && user.userId) {
                    for (const [civilianId, civilian] of civiliansMap) {
                        if (civilian.userId === user.userId || civilianId === user.userId) {
                            associatedCivilian = civilian;
                            console.log(`Unit ${user.callsign} linked to civilian via userId: ${civilianId}`);
                            break;
                        }
                    }
                }
                
                // Method 4: Look for recent logs that mention both this unit and a civilian
                if (!associatedCivilian) {
                    logsSnapshot.forEach(doc => {
                        const logData = doc.data();
                        if (logData.callsign === user.callsign && logData.civilianId) {
                            const foundCivilian = civiliansMap.get(logData.civilianId);
                            if (foundCivilian) {
                                associatedCivilian = foundCivilian;
                                console.log(`Unit ${user.callsign} linked to civilian via log entry: ${logData.civilianId}`);
                            }
                        }
                    });
                }
            }
            
            // Build enhanced user object
            const enhancedUser = {
                ...user,
                rawData: user.rawData
            };
            
            // Add Discord/IRL names if found
            if (userDetails) {
                enhancedUser.discordName = userDetails.discordName;
                enhancedUser.irlName = userDetails.irlName;
                enhancedUser.enhanced = true;
                enhancedUser.enhancedFrom = 'logs';
                console.log(`Enhanced ${user.username} with details:`, userDetails);
            }
            
            // Add civilian association for units
            if (associatedCivilian) {
                enhancedUser.associatedCivilian = associatedCivilian;
                enhancedUser.civilianName = `${associatedCivilian.rawData?.firstName || associatedCivilian.rawData?.firstname || ''} ${associatedCivilian.rawData?.lastName || associatedCivilian.rawData?.lastname || ''}`.trim();
                enhancedUser.civilianId = associatedCivilian.id;
                console.log(`Unit ${user.callsign} associated with civilian: ${enhancedUser.civilianName} (${enhancedUser.civilianId})`);
            }
            
            return enhancedUser;
        });
        
        const enhancedCount = enhancedUsers.filter(u => u.enhanced).length;
        const unitCivilianLinks = enhancedUsers.filter(u => u.type === 'unit' && u.associatedCivilian).length;
        console.log(`Enhanced ${enhancedCount}/${users.length} users with data from logs`);
        console.log(`Linked ${unitCivilianLinks} units with civilian identities`);
        
        return enhancedUsers;
        
    } catch (error) {
        console.error('Error enhancing user data with civilian associations:', error);
        return users; // Return original users if enhancement fails
    }
}

// Function to enhance user data by looking up Discord/IRL names from logs
async function enhanceUserData(users) {
    console.log('Enhancing user data using logs collection...');
    
    try {
        // Get recent logs to find Discord/IRL names for each user
        const logsRef = collection(db, 'logs');
        // Get recent logs (last 1000 entries should be enough to catch recent logins)
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(1000));
        const logsSnapshot = await getDocs(logsQuery);
        
        console.log(`Found ${logsSnapshot.size} log entries to search for user data`);
        
        // Build a map of callsigns/IDs to user details from logs
        const userDetailsMap = new Map();
        
        logsSnapshot.forEach(doc => {
            const logData = doc.data();
            
            // Look for logs that contain both callsign/ID and Discord/IRL names
            if (logData.callsign && (logData.discordName || logData.irlName)) {
                const key = logData.callsign;
                
                // Store the most recent user details for this callsign
                if (!userDetailsMap.has(key) || 
                    (logData.timestamp && userDetailsMap.get(key).timestamp && 
                     logData.timestamp.toDate() > userDetailsMap.get(key).timestamp.toDate())) {
                    
                    userDetailsMap.set(key, {
                        discordName: logData.discordName || null,
                        irlName: logData.irlName || null,
                        serviceType: logData.serviceType || null,
                        unitId: logData.unitId || null,
                        civilianId: logData.civilianId || null,
                        dispatcherID: logData.dispatcherID || null,
                        timestamp: logData.timestamp
                    });
                    
                    console.log(`Found user details for ${key}:`, userDetailsMap.get(key));
                }
            }
            
            // Also check by unitId, civilianId, dispatcherID if they exist
            ['unitId', 'civilianId', 'dispatcherID'].forEach(idField => {
                if (logData[idField] && (logData.discordName || logData.irlName)) {
                    const key = logData[idField];
                    
                    if (!userDetailsMap.has(key) || 
                        (logData.timestamp && userDetailsMap.get(key).timestamp && 
                         logData.timestamp.toDate() > userDetailsMap.get(key).timestamp.toDate())) {
                        
                        userDetailsMap.set(key, {
                            discordName: logData.discordName || null,
                            irlName: logData.irlName || null,
                            serviceType: logData.serviceType || null,
                            unitId: logData.unitId || null,
                            civilianId: logData.civilianId || null,
                            dispatcherID: logData.dispatcherID || null,
                            timestamp: logData.timestamp
                        });
                        
                        console.log(`Found user details for ${idField} ${key}:`, userDetailsMap.get(key));
                    }
                }
            });
        });
        
        console.log(`Built user details map with ${userDetailsMap.size} entries`);
        
        // Enhance each user with details from logs
        const enhancedUsers = users.map(user => {
            let userDetails = null;
            
            // Try to find user details by various identifiers
            const searchKeys = [
                user.callsign,     // Try callsign first
                user.id,           // Try document ID
                user.username      // Try username
            ];
            
            for (const key of searchKeys) {
                if (key && userDetailsMap.has(key)) {
                    userDetails = userDetailsMap.get(key);
                    break;
                }
            }
            
            if (userDetails) {
                console.log(`Enhanced ${user.username} with details:`, userDetails);
                return {
                    ...user,
                    discordName: userDetails.discordName,
                    irlName: userDetails.irlName,
                    enhanced: true,
                    enhancedFrom: 'logs',
                    // Preserve original rawData structure
                    rawData: user.rawData
                };
            }
            
            return user;
        });
        
        const enhancedCount = enhancedUsers.filter(u => u.enhanced).length;
        console.log(`Enhanced ${enhancedCount}/${users.length} users with data from logs`);
        
        return enhancedUsers;
        
    } catch (error) {
        console.error('Error enhancing user data from logs:', error);
        return users; // Return original users if enhancement fails
    }
}

// Optional: Function to create a user profiles cache collection for better performance
window.createUserProfilesCache = async function() {
    console.log('Creating user profiles cache from logs...');
    
    try {
        const logsRef = collection(db, 'logs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(2000));
        const logsSnapshot = await getDocs(logsQuery);
        
        const userProfiles = new Map();
        
        // Extract unique user profiles from logs
        logsSnapshot.forEach(doc => {
            const logData = doc.data();
            
            if (logData.callsign && (logData.discordName || logData.irlName)) {
                const profile = {
                    callsign: logData.callsign,
                    discordName: logData.discordName || null,
                    irlName: logData.irlName || null,
                    serviceType: logData.serviceType || null,
                    unitId: logData.unitId || null,
                    civilianId: logData.civilianId || null,
                    dispatcherID: logData.dispatcherID || null,
                    lastSeen: logData.timestamp,
                    createdAt: new Date()
                };
                
                // Use callsign as key, keep most recent data
                if (!userProfiles.has(logData.callsign) || 
                    (logData.timestamp && userProfiles.get(logData.callsign).lastSeen &&
                     logData.timestamp.toDate() > userProfiles.get(logData.callsign).lastSeen.toDate())) {
                    userProfiles.set(logData.callsign, profile);
                }
            }
        });
        
        console.log(`Found ${userProfiles.size} unique user profiles`);
        
        // Save to userProfiles collection
        const userProfilesRef = collection(db, 'userProfiles');
        let savedCount = 0;
        
        for (const [callsign, profile] of userProfiles) {
            try {
                await addDoc(userProfilesRef, profile);
                savedCount++;
                console.log(`Saved profile for ${callsign}`);
            } catch (error) {
                console.error(`Error saving profile for ${callsign}:`, error);
            }
        }
        
        console.log(`Successfully created user profiles cache with ${savedCount} profiles`);
        showNotification(`Created user profiles cache with ${savedCount} profiles`, 'success');
        
    } catch (error) {
        console.error('Error creating user profiles cache:', error);
        showNotification('Error creating user profiles cache', 'error');
    }
};

function updateUserCount(count) {
    const header = document.querySelector('#user-management .section-header h3');
    if (header) {
        header.textContent = `Connected Users (${count})`;
    }
}

function setupUserFiltering() {
    const serviceFilter = document.getElementById('userServiceFilter');
    const refreshBtn = document.getElementById('refreshUsersBtn');
    
    if (serviceFilter) {
        serviceFilter.addEventListener('change', filterUsers);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            showNotification('Refreshing users...', 'info');
            loadUsers();
        });
    }
}

function filterUsers() {
    const serviceFilter = document.getElementById('userServiceFilter');
    const selectedService = serviceFilter ? serviceFilter.value.toLowerCase() : '';
    const rows = document.querySelectorAll('.user-row');
    
    let visibleCount = 0;
    
    rows.forEach(row => {
        const rowService = row.dataset.service;
        
        if (!selectedService || rowService === selectedService) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update count in header
    const header = document.querySelector('#user-management .section-header h3');
    if (header) {
        const totalUsers = document.querySelectorAll('.user-row').length;
        if (selectedService) {
            const serviceName = selectedService.charAt(0).toUpperCase() + selectedService.slice(1);
            header.textContent = `${serviceName} Users (${visibleCount}/${totalUsers})`;
        } else {
            header.textContent = `Connected Users (${visibleCount})`;
        }
    }
}

// Call Management Functions
async function loadCalls() {
    try {
        showLoading();
        
        const callsRef = collection(db, 'calls');
        const callsQuery = query(callsRef, orderBy('timestamp', 'desc'), limit(20));
        const snapshot = await getDocs(callsQuery);
        
        // Support multiple possible container IDs (backwards-compatibility with existing admin.html)
        const container = document.getElementById('calls-grid') || document.getElementById('activeCallsGrid') || document.getElementById('callsList');
        if (!container) {
            console.warn('[ADMIN] loadCalls: calls container element not found (expected id: calls-grid or activeCallsGrid). Aborting render.');
            hideLoading();
            return;
        }
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="section-card">No calls found</div>';
            hideLoading();
            return;
        }
        
        const calls = [];
        snapshot.forEach(doc => calls.push({ id: doc.id, data: doc.data() }));

        // Render cards without action buttons; clicking a card selects it and shows details/logs
        calls.forEach(({ id, data }) => {
            const callCard = document.createElement('div');
            callCard.className = 'call-card';
            callCard.dataset.callId = id;

            const serviceColor = getUnitTypeColor(data.service || 'Police');
            const serviceTextColor = getContrastingTextColor(serviceColor);

            // Format timestamp
            let formattedTimestamp = 'Timestamp not available';
            if (data.timestamp) {
                const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                formattedTimestamp = `${timestamp.toLocaleTimeString('en-GB')} ${timestamp.toLocaleDateString('en-GB')}`;
            }

            callCard.innerHTML = `
                <div class="call-info">
                    <p class="call-service" style="background-color: ${serviceColor}; color: ${serviceTextColor};">${data.service || 'Service'}</p>
                    <p class="call-location"><strong>Location:</strong> ${data.location || 'Unknown'}</p>
                    <p class="call-status"><strong>Status:</strong> ${data.status || 'Awaiting Dispatch'}</p>
                    <p class="call-timestamp"><strong>Time:</strong> ${formattedTimestamp}</p>
                    <div class="attached-units-scroll" id="attached-units-${id}"></div>
                </div>
            `;

            // Select on click
            callCard.addEventListener('click', async () => {
                // Highlight
                document.querySelectorAll('.call-card.selected-call').forEach(c => c.classList.remove('selected-call'));
                callCard.classList.add('selected-call');
                // Show details/log
                if (typeof viewCallDetails === 'function') {
                    await viewCallDetails(id);
                }
            });

            container.appendChild(callCard);
        });

        // Populate attached units bar for each call (non-blocking)
        for (const { id } of calls) {
            // fire-and-forget each rendering, they will log on error
            adminRenderAttachedUnitsForCall(id).catch(e => console.error('[ADMIN] Error rendering attached units for call', id, e));
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error loading calls:', error);
        showNotification('Error loading calls', 'error');
        hideLoading();
    }
}

// System Logs Functions
async function loadLogs() {
    try {
        showLoading();
        
        const logsRef = collection(db, 'system_logs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(logsQuery);
        
        const tbody = document.getElementById('logs-table-body');
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No logs found</td></tr>';
            hideLoading();
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const row = document.createElement('tr');
            
            const timestamp = data.timestamp?.toDate()?.toLocaleString() || 'Unknown';
            
            row.innerHTML = `
                <td>${timestamp}</td>
                <td>${data.level || 'INFO'}</td>
                <td>${data.source || 'System'}</td>
                <td>${data.message || 'No message'}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        hideLoading();
    } catch (error) {
        console.error('Error loading logs:', error);
        showNotification('Error loading logs', 'error');
        hideLoading();
    }
}

// Settings Functions
function loadSettings() {
    // Initialize broadcast functionality
    initializeBroadcast();
    
    // Initialize emergency controls
    initializeEmergencyControls();
    
    // Initialize auto-refresh toggle
    const autoRefreshToggle = document.getElementById('auto-refresh');
    if (autoRefreshToggle) {
        autoRefreshToggle.checked = isAutoRefresh;
        autoRefreshToggle.addEventListener('change', (e) => {
            isAutoRefresh = e.target.checked;
            if (isAutoRefresh) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });
    }
}

function initializeBroadcast() {
    const sendButton = document.getElementById('send-broadcast');
    if (sendButton) {
        sendButton.addEventListener('click', sendBroadcastMessage);
    }
}

function initializeEmergencyControls() {
    // Emergency lockdown
    const lockdownButton = document.getElementById('emergency-lockdown');
    if (lockdownButton) {
        lockdownButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to initiate emergency lockdown? This will restrict all non-essential access.')) {
                showNotification('Emergency lockdown initiated', 'warning');
            }
        });
    }

    // Clear all calls
    const clearCallsButton = document.getElementById('clear-all-calls');
    if (clearCallsButton) {
        clearCallsButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all active calls? This action cannot be undone.')) {
                showNotification('All calls cleared', 'warning');
            }
        });
    }

    // Reset system
    const resetButton = document.getElementById('reset-system');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the entire system? This will clear all data and log out all users.')) {
                showNotification('System reset initiated', 'error');
            }
        });
    }
}

async function sendBroadcastMessage() {
    const messageTextarea = document.getElementById('broadcast-message');
    const message = messageTextarea.value.trim();
    
    if (!message) {
        showNotification('Please enter a message', 'warning');
        return;
    }

    try {
        // Get selected services
        const serviceCheckboxes = document.querySelectorAll('.service-checkboxes input[type="checkbox"]:checked');
        const selectedServices = Array.from(serviceCheckboxes).map(cb => cb.value);

        if (selectedServices.length === 0) {
            showNotification('Please select at least one service', 'warning');
            return;
        }

        // Here you would implement the actual broadcast functionality
        // For now, just show a success message
        showNotification(`Broadcast sent to ${selectedServices.join(', ')}`, 'success');
        
        messageTextarea.value = '';
    } catch (error) {
        console.error('Error sending broadcast:', error);
        showNotification('Error sending broadcast', 'error');
    }
}

// Auto-refresh Functions
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // Start real-time listeners for dashboard components
    startDashboardRealTimeListeners();
    
    // Keep the interval for tabs that don't have real-time listeners
    autoRefreshInterval = setInterval(() => {
        if (isAutoRefresh) {
            switch(currentTab) {
                case 'call-management':
                case 'calls':
                    loadCalls();
                    break;
                case 'system-logs':
                case 'logs':
                    loadLogs();
                    break;
            }
        }
    }, 15000); // Refresh every 15 seconds for non-real-time tabs
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    
    // Stop all real-time listeners
    stopDashboardRealTimeListeners();
}

// Real-time dashboard listeners
let dashboardListeners = [];

function startDashboardRealTimeListeners() {
    if (!db) {
        console.warn('Database not available for real-time listeners');
        return;
    }
    
    // Stop existing listeners
    stopDashboardRealTimeListeners();
    
    console.log('🔄 Starting real-time dashboard listeners...');
    
    // 1. Listen for units changes to update user count and service status
    const unitsRef = collection(db, 'units');
    const unitsListener = onSnapshot(unitsRef, (snapshot) => {
        console.log(`📊 Units updated: ${snapshot.size} units total`);
        updateMetricsRealTime();
        if (currentTab === 'dashboard') {
            debouncedLoadServiceStatus();
        }
        if (currentTab === 'users' || currentTab === 'user-management') {
            loadUsers();
        }
    }, (error) => {
        console.error('❌ Error in units listener:', error);
    });
    dashboardListeners.push(unitsListener);
    
    // 2. Listen for dispatchers changes
    const dispatchersRef = collection(db, 'dispatchers');
    const dispatchersListener = onSnapshot(dispatchersRef, (snapshot) => {
        console.log(`📊 Dispatchers updated: ${snapshot.size} dispatchers total`);
        updateMetricsRealTime();
        if (currentTab === 'dashboard') {
            debouncedLoadServiceStatus();
        }
        if (currentTab === 'users' || currentTab === 'user-management') {
            loadUsers();
        }
    }, (error) => {
        console.error('❌ Error in dispatchers listener:', error);
    });
    dashboardListeners.push(dispatchersListener);
    
    // 3. Listen for civilians changes
    const civiliansRef = collection(db, 'civilians');
    const civiliansListener = onSnapshot(civiliansRef, (snapshot) => {
        console.log(`📊 Civilians updated: ${snapshot.size} civilians total`);
        updateMetricsRealTime();
        if (currentTab === 'dashboard') {
            debouncedLoadServiceStatus();
        }
        if (currentTab === 'users' || currentTab === 'user-management') {
            loadUsers();
        }
    }, (error) => {
        console.error('❌ Error in civilians listener:', error);
    });
    dashboardListeners.push(civiliansListener);
    
    // 4. Listen for calls changes to update active calls count
    const callsRef = collection(db, 'calls');
    const callsListener = onSnapshot(callsRef, (snapshot) => {
        console.log(`� Calls updated: ${snapshot.size} calls total`);
        updateActiveCallsRealTime();
    }, (error) => {
        console.error('❌ Error in calls listener:', error);
    });
    dashboardListeners.push(callsListener);
    
    // 5. Listen for alerts changes
    const alertsRef = collection(db, 'alerts');
    const alertsListener = onSnapshot(alertsRef, (snapshot) => {
        console.log(`� Alerts updated: ${snapshot.size} alerts total`);
        updateRecentAlertsRealTime();
    }, (error) => {
        console.error('❌ Error in alerts listener:', error);
    });
    dashboardListeners.push(alertsListener);
    
    // 6. Listen for messages changes to update system status
    const messagesRef = collection(db, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(10));
    const messagesListener = onSnapshot(messagesQuery, (snapshot) => {
        console.log(`� Messages updated: ${snapshot.size} messages total`);
        updateSystemStatusRealTime();
    }, (error) => {
        console.error('❌ Error in messages listener:', error);
    });
    dashboardListeners.push(messagesListener);
    
    console.log(`✅ Real-time dashboard listeners started successfully! Monitoring ${dashboardListeners.length} collections`);
    console.log('📡 Dashboard will now update automatically when data changes');
}

function stopDashboardRealTimeListeners() {
    console.log('🔄 Stopping real-time dashboard listeners...');
    dashboardListeners.forEach(unsubscribe => {
        try {
            unsubscribe();
        } catch (error) {
            console.warn('Error unsubscribing from dashboard listener:', error);
        }
    });
    dashboardListeners = [];
}

// Real-time metric update functions
async function updateMetricsRealTime() {
    try {
        const totalUsers = await getUserCount();
        const totalUsersEl = document.getElementById('totalUsers');
        if (totalUsersEl) {
            // Add animation to show update
            totalUsersEl.style.transition = 'all 0.3s ease';
            totalUsersEl.style.background = '#28a745';
            totalUsersEl.style.color = 'white';
            totalUsersEl.textContent = totalUsers;
            
            setTimeout(() => {
                totalUsersEl.style.background = '';
                totalUsersEl.style.color = '';
            }, 1000);
        }
        
        // Update timestamp
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error updating metrics in real-time:', error);
    }
}

async function updateActiveCallsRealTime() {
    try {
        const activeCalls = await getActiveCallsCount();
        const activeCallsEl = document.getElementById('activeCalls');
        if (activeCallsEl) {
            // Add animation to show update
            activeCallsEl.style.transition = 'all 0.3s ease';
            activeCallsEl.style.background = '#17a2b8';
            activeCallsEl.style.color = 'white';
            activeCallsEl.textContent = activeCalls;
            
            setTimeout(() => {
                activeCallsEl.style.background = '';
                activeCallsEl.style.color = '';
            }, 1000);
        }
        
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error updating active calls in real-time:', error);
    }
}

async function updateRecentAlertsRealTime() {
    try {
        const recentAlerts = await getRecentAlertsCount();
        const recentAlertsEl = document.getElementById('recentAlerts');
        if (recentAlertsEl) {
            // Add animation to show update
            recentAlertsEl.style.transition = 'all 0.3s ease';
            recentAlertsEl.style.background = '#ffc107';
            recentAlertsEl.style.color = 'black';
            recentAlertsEl.textContent = recentAlerts;
            
            setTimeout(() => {
                recentAlertsEl.style.background = '';
                recentAlertsEl.style.color = '';
            }, 1000);
        }
        
        updateLastUpdateTime();
        
    } catch (error) {
        console.error('Error updating recent alerts in real-time:', error);
    }
}

function updateSystemStatusRealTime() {
    // Update system status indicator
    const systemStatusEl = document.getElementById('systemStatus');
    if (systemStatusEl) {
        // Flash green to indicate activity
        systemStatusEl.style.transition = 'all 0.3s ease';
        systemStatusEl.style.color = '#28a745';
        systemStatusEl.style.fontWeight = 'bold';
        systemStatusEl.textContent = 'Active';
        
        // Flash background animation
        systemStatusEl.style.background = '#d4edda';
        setTimeout(() => {
            systemStatusEl.style.color = '';
            systemStatusEl.style.background = 'transparent';
        }, 1000);
        
        console.log('📊 System status updated: Active');
    }
    
    updateLastUpdateTime();
}

function updateLastUpdateTime() {
    // Add or update last update time indicator
    let updateTimeEl = document.getElementById('lastUpdateTime');
    if (!updateTimeEl) {
        // Create the element if it doesn't exist
        const dashboardHeader = document.querySelector('#dashboard .section-header');
        if (dashboardHeader) {
            updateTimeEl = document.createElement('div');
            updateTimeEl.id = 'lastUpdateTime';
            updateTimeEl.style.fontSize = '0.8rem';
            updateTimeEl.style.color = '#6c757d';
            updateTimeEl.style.marginTop = '5px';
            dashboardHeader.appendChild(updateTimeEl);
        }
    }
    
    if (updateTimeEl) {
        const now = new Date();
        updateTimeEl.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        
        // Flash to show update
        updateTimeEl.style.color = '#28a745';
        setTimeout(() => {
            updateTimeEl.style.color = '#6c757d';
        }, 1000);
    }
}

// Utility Functions
function showLoading() {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading...</div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

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

// Utility function to log user actions
async function logUserAction(user, service, action, details = '') {
    try {
        if (!db) {
            console.warn('Database not available for logging');
            return;
        }
        
        const logEntry = {
            timestamp: Timestamp.now(),
            action: action,
            details: details,
            serviceType: service,
            serviceId: user,
            callsign: user,
            discordName: user,
            irlName: user
        };
        
        // Add to logs collection (the main logs that recent activity reads from)
        await addDoc(collection(db, 'logs'), logEntry);
        
        console.log('Action logged:', `${service} user ${user} ${action}${details ? ': ' + details : ''}`);
    } catch (error) {
        console.error('Error logging user action:', error);
    }
}

// Demo data generator for testing (can be called from console)
window.generateDemoData = async function() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        // Generate demo units (matching the real system structure)
        const demoUnits = [
            { callsign: 'P-101', unitType: 'Police', status: 'Available', timestamp: new Date() },
            { callsign: 'F-12', unitType: 'Fire', status: 'Unavailable', timestamp: new Date() },
            { callsign: 'A-05', unitType: 'Ambulance', status: 'Available', timestamp: new Date() }
        ];
        
        // Generate demo dispatchers
        const demoDispatchers = [
            { sessionId: 'dispatch-001', timestamp: new Date(), status: 'active' }
        ];
        
        // Generate demo civilians
        const demoCivilians = [
            { firstName: 'John', lastName: 'Doe', timestamp: new Date() },
            { firstName: 'Jane', lastName: 'Smith', timestamp: new Date() }
        ];
        
        // Generate demo calls
        const demoCalls = [
            { status: 'active', type: 'emergency', location: 'Main St & 1st Ave', timestamp: new Date() },
            { status: 'pending', type: 'medical', location: 'Hospital District', timestamp: new Date(Date.now() - 5 * 60000) },
            { status: 'in-progress', type: 'fire', location: 'Industrial Park', timestamp: new Date(Date.now() - 10 * 60000) }
        ];
        
        // Add units to database
        for (const unit of demoUnits) {
            await addDoc(collection(db, 'units'), unit);
        }
        
        // Add dispatchers to database
        for (const dispatcher of demoDispatchers) {
            await addDoc(collection(db, 'dispatchers'), dispatcher);
        }
        
        // Add civilians to database
        for (const civilian of demoCivilians) {
            await addDoc(collection(db, 'civilians'), civilian);
        }
        
        // Add calls to database
        for (const call of demoCalls) {
            await addDoc(collection(db, 'calls'), call);
        }
        
        console.log('Demo data generated successfully!');
        console.log('- Added', demoUnits.length, 'units');
        console.log('- Added', demoDispatchers.length, 'dispatchers');
        console.log('- Added', demoCivilians.length, 'civilians');
        console.log('- Added', demoCalls.length, 'calls');
        console.log('Refreshing dashboard...');
        loadDashboard();
        
    } catch (error) {
        console.error('Error generating demo data:', error);
    }
};

// Debug function to check ALL collections for user data
window.checkAllCollections = async function() {
    console.log('=== CHECKING ALL COLLECTIONS FOR USER DATA ===');
    
    try {
        // Get all collections to see what exists
        const collections = ['units', 'dispatchers', 'civilians', 'users', 'sessions', 'logins', 'playerData', 'userProfiles', 'logs'];
        
        for (const collectionName of collections) {
            try {
                const ref = collection(db, collectionName);
                const snapshot = await getDocs(ref);
                console.log(`\n=== ${collectionName.toUpperCase()} COLLECTION (${snapshot.size} docs) ===`);
                
                if (snapshot.size > 0) {
                    snapshot.forEach((doc, index) => {
                        if (index < 3) { // Show first 3 docs as examples
                            console.log(`${collectionName} doc ${doc.id}:`, doc.data());
                        }
                    });
                    if (snapshot.size > 3) {
                        console.log(`... and ${snapshot.size - 3} more documents`);
                    }
                } else {
                    console.log(`No documents in ${collectionName}`);
                }
            } catch (error) {
                console.log(`Collection ${collectionName} doesn't exist or error:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error checking collections:', error);
    }
    
    console.log('\n=== END ALL COLLECTIONS CHECK ===');
};

// Debug function to help understand unit-civilian relationships
window.debugUnitCivilianLinks = async function() {
    console.log('=== DEBUG UNIT-CIVILIAN LINKS ===');
    
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        // Get all units
        const unitsRef = collection(db, 'units');
        const unitsSnapshot = await getDocs(unitsRef);
        
        // Get all civilians
        const civiliansRef = collection(db, 'civilians');
        const civiliansSnapshot = await getDocs(civiliansRef);
        
        // Get recent logs
        const logsRef = collection(db, 'logs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
        const logsSnapshot = await getDocs(logsQuery);
        
        console.log(`Found ${unitsSnapshot.size} units, ${civiliansSnapshot.size} civilians, ${logsSnapshot.size} logs`);
        
        // Show all units with their data
        console.log('\n--- UNITS ---');
        unitsSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Unit ID: ${doc.id}`);
            console.log(`  Callsign: ${data.callsign}`);
            console.log(`  Unit Type: ${data.unitType}`);
            console.log(`  Status: ${data.status}`);
            console.log(`  Timestamp: ${data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : 'None'}`);
            console.log(`  Raw Data:`, data);
            console.log('---');
        });
        
        // Show all civilians with their data
        console.log('\n--- CIVILIANS ---');
        civiliansSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Civilian ID: ${doc.id}`);
            console.log(`  First Name: ${data.firstName || data.firstname || 'N/A'}`);
            console.log(`  Last Name: ${data.lastName || data.lastname || 'N/A'}`);
            console.log(`  DOB: ${data.dob || 'N/A'}`);
            console.log(`  Phone: ${data.phone || 'N/A'}`);
            console.log(`  Timestamp: ${data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : 'None'}`);
            console.log(`  Raw Data:`, data);
            console.log('---');
        });
        
        // Show relevant log entries
        console.log('\n--- RECENT LOGS WITH NAMES ---');
        logsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.discordName || data.irlName || data.callsign) {
                console.log(`Log Entry:`);
                console.log(`  Callsign: ${data.callsign || 'N/A'}`);
                console.log(`  Discord Name: ${data.discordName || 'N/A'}`);
                console.log(`  IRL Name: ${data.irlName || 'N/A'}`);
                console.log(`  Service Type: ${data.serviceType || 'N/A'}`);
                console.log(`  Unit ID: ${data.unitId || 'N/A'}`);
                console.log(`  Civilian ID: ${data.civilianId || 'N/A'}`);
                console.log(`  Action: ${data.action || 'N/A'}`);
                console.log('  ---');
            }
        });
        
        console.log('=== END DEBUG ===');
        
    } catch (error) {
        console.error('Error in debug function:', error);
    }
};

// Check current database state (can be called from console)
window.checkDatabaseState = async function() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        console.log('=== DATABASE STATE CHECK ===');
        
        // Check units
        const unitsRef = collection(db, 'units');
        const unitsSnapshot = await getDocs(unitsRef);
        console.log(`Total units in database: ${unitsSnapshot.size}`);
        
        unitsSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Unit: ${data.callsign || 'Unknown'} - Type: ${data.unitType} - Status: ${data.status}`);
        });
        
        // Check dispatchers
        const dispatchersRef = collection(db, 'dispatchers');
        const dispatchersSnapshot = await getDocs(dispatchersRef);
        console.log(`Total dispatchers in database: ${dispatchersSnapshot.size}`);
        
        // Check civilians
        const civiliansRef = collection(db, 'civilians');
        const civiliansSnapshot = await getDocs(civiliansRef);
        console.log(`Total civilians in database: ${civiliansSnapshot.size}`);
        
        // Check calls
        const callsRef = collection(db, 'calls');
        const callsSnapshot = await getDocs(callsRef);
        console.log(`Total calls in database: ${callsSnapshot.size}`);
        
        // Check activity
        const activityRef = collection(db, 'activity');
        const activitySnapshot = await getDocs(activityRef);
        console.log(`Total activity entries: ${activitySnapshot.size}`);
        
        console.log('=== END DATABASE STATE ===');
        
    } catch (error) {
        console.error('Error checking database state:', error);
    }
};

// Force Disconnect User Function - Using imported function from firebase/adminDisconnect.js
// (Old implementation removed to avoid conflicts)

// Enhanced user action functions
window.viewUserDetails = async function(userId, userType) {
    try {
        // First try to find the enhanced user data from the current list
        let userData = currentEnhancedUsers.find(user => user.id === userId);
        
        if (!userData) {
            // Fallback: get raw data from database if not found in enhanced list
            if (!db) {
                showNotification('Database not available', 'error');
                return;
            }

            let collectionName;
            switch(userType) {
                case 'unit':
                    collectionName = 'units';
                    break;
                case 'dispatcher':
                    collectionName = 'dispatchers';
                    break;
                case 'civilian':
                    collectionName = 'civilians';
                    break;
                default:
                    showNotification('Unknown user type', 'error');
                    return;
            }

            // Get user document directly (single document read)
            try {
                const userDocRef = doc(db, collectionName, userId);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap && userDocSnap.exists()) {
                    const raw = userDocSnap.data() || {};

                    // Build normalized user object similar to enhanced users
                    const username = raw.callsign || raw.username || ((raw.firstName || raw.firstname) ? `${raw.firstName || raw.firstname} ${raw.lastName || raw.lastname || ''}`.trim() : `User ${userDocSnap.id.slice(-6)}`);
                    const service = raw.unitType || (userType === 'dispatcher' ? 'Dispatch' : (userType === 'civilian' ? 'Civilian' : (raw.service || 'Unknown')));
                    const status = raw.status || raw.state || 'Unknown';
                    const callsign = raw.callsign || raw.callsignId || userDocSnap.id;
                    const lastActive = raw.timestamp || raw.lastActive || null;

                    userData = {
                        id: userDocSnap.id,
                        username,
                        service,
                        status,
                        callsign,
                        lastActive,
                        type: userType,
                        userId: raw.userId || null,
                        rawData: raw
                    };

                    // Try to detect an associated civilian if present in raw data
                    if (raw.civilianId || raw.associatedCivilianId || raw.associatedCivilian) {
                        const civId = raw.civilianId || raw.associatedCivilianId || raw.associatedCivilian;
                        try {
                            const civRef = doc(db, 'civilians', civId);
                            const civSnap = await getDoc(civRef);
                            if (civSnap && civSnap.exists()) {
                                const civ = civSnap.data() || {};
                                const civName = `${civ.firstName || civ.firstname || ''} ${civ.lastName || civ.lastname || ''}`.trim() || civ.displayName || 'Unknown';
                                userData.hasAssociation = true;
                                userData.civilianName = civName || 'Unknown';
                                userData.civilianId = civSnap.id;
                            } else {
                                userData.hasAssociation = true;
                                userData.civilianId = civId;
                                userData.civilianName = 'Unknown';
                            }
                        } catch (e) {
                            console.warn('Error fetching associated civilian:', e);
                            userData.hasAssociation = true;
                            userData.civilianId = civId;
                            userData.civilianName = 'Unknown';
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching user document fallback:', err);
            }
        }
        
        if (!userData) {
            showNotification('User not found', 'error');
            return;
        }
        
        // Create and show user details modal
        showUserDetailsModal(userData, userType);
        
    } catch (error) {
        console.error('Error viewing user details:', error);
        showNotification('Error loading user details', 'error');
    }
};

// ===== MESSAGING SYSTEM =====

// Global messaging variables
let currentMessageRecipient = null;
let audioContext = null;

// Initialize audio context for priority tones
function initializeAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// Main function to open message composition modal
// Now using the centralized messaging system's sendUserMessage function

// Update character count display
function updateCharacterCount() {
    const messageContent = document.getElementById('messageContent');
    const charCount = document.getElementById('charCount');
    
    if (messageContent && charCount) {
        const length = messageContent.value.length;
        charCount.textContent = length;
        
        // Update styling based on character count
        charCount.parentElement.className = 'character-count';
        if (length > 400) {
            charCount.parentElement.classList.add('danger');
        } else if (length > 300) {
            charCount.parentElement.classList.add('warning');
        }
    }
}

// Make centralized messaging functions available globally for HTML onclick handlers
window.sendMessage = sendMessage;
window.closeMessageModal = closeMessageModal;
window.sendUserMessage = sendUserMessage;

// Generate unique message ID
function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Store message in Firebase
async function storeMessage(messageData) {
    if (!db) {
        throw new Error('Database not initialized');
    }
    
    try {
        // Get the user document to add message to their adminMessages array
        const userCollections = ['units', 'dispatchers', 'civilians'];
        let userDocRef = null;
        let userDoc = null;
        
        // Find the user document across all collections
        for (const collectionName of userCollections) {
            const testRef = doc(db, collectionName, currentMessageRecipient.id);
            const testDoc = await getDoc(testRef);
            
            if (testDoc.exists()) {
                userDocRef = testRef;
                userDoc = testDoc;
                console.log(`Found user in ${collectionName} collection`);
                break;
            }
        }
        
        if (!userDocRef || !userDoc) {
            throw new Error(`User document not found: ${currentMessageRecipient.id}`);
        }
        
        // Get existing adminMessages array or create new one
        const userData = userDoc.data();
        const existingMessages = userData.adminMessages || [];
        
        // Add new message to the beginning of the array (newest first)
        const updatedMessages = [messageData, ...existingMessages];
        
        // Keep only the last 50 messages to prevent unlimited growth
        if (updatedMessages.length > 50) {
            updatedMessages.splice(50);
        }
        
        // Update the user document with the new message
        await updateDoc(userDocRef, {
            adminMessages: updatedMessages,
            lastAdminMessage: messageData.timestamp,
            lastAdminMessagePriority: messageData.priority
        });
        
        console.log('Message stored successfully in user document');
        
        // Also store in a central adminMessages collection for admin tracking
        const adminMessagesRef = collection(db, 'adminMessages');
        await addDoc(adminMessagesRef, {
            ...messageData,
            adminId: 'current-admin', // In a real system, you'd use the actual admin ID
            collectionType: userDoc.ref.parent.id // Store which collection the user is in
        });
        
        console.log('Message stored successfully in admin messages collection');
        
    } catch (error) {
        console.error('Error storing message in Firebase:', error);
        throw error;
    }
}

// NOTE: The real viewUserDetails implementation is defined earlier (async) so
// we intentionally do not redefine it here. Removing duplicate override so the
// fallback Firestore fetch logic in the async implementation is used.

// Enhanced user details modal using the new HTML modal structure
function showUserDetailsModal(userData, userType) {
    const modal = document.getElementById('userDetailsModal');
    if (!modal) {
        console.error('User details modal not found in DOM');
        showNotification('User details modal not available', 'error');
        return;
    }
    
    const contentDiv = document.getElementById('userDetailsContent');
    if (!contentDiv) {
        console.error('User details content div not found');
        return;
    }
    
    // Build the details HTML
    let detailsHTML = '<div class="user-details-grid">';
    
    // Basic Information - compute service text/class defensively so missing fields don't throw
    const _serviceText = userData.service || userData.rawData?.unitType || (userData.type ? (userData.type.charAt(0).toUpperCase() + userData.type.slice(1)) : 'Unknown');
    const _serviceClass = (_serviceText || 'unknown').toLowerCase().replace(/\s+/g, '-');
    const _statusClass = (userData.status === 'Active' || userData.status === 'Online') ? 'online' : 'offline';

    detailsHTML += `
        <div class="user-detail-item">
            <div class="user-detail-label">Username</div>
            <div class="user-detail-value">${userData.username || 'N/A'}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">Service Type</div>
            <div class="user-detail-value badge ${_serviceClass}">${_serviceText}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">Callsign/ID</div>
            <div class="user-detail-value code">${userData.callsign || userData.id || 'N/A'}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">Status</div>
            <div class="user-detail-value badge ${_statusClass}">${userData.status || 'Unknown'}</div>
        </div>
    `;
    
    // Enhanced Information (if available)
    if (userData.enhanced) {
        if (userData.discordName) {
            detailsHTML += `
                <div class="user-detail-item">
                    <div class="user-detail-label">Discord Name</div>
                    <div class="user-detail-value">${userData.discordName}</div>
                </div>
            `;
        }
        if (userData.irlName) {
            detailsHTML += `
                <div class="user-detail-item">
                    <div class="user-detail-label">IRL Name</div>
                    <div class="user-detail-value">${userData.irlName}</div>
                </div>
            `;
        }
    }
    
    // Type-specific information
    if (userType === 'unit') {
        detailsHTML += `
            <div class="user-detail-item">
                <div class="user-detail-label">Unit Type</div>
                <div class="user-detail-value">${userData.rawData?.unitType || 'N/A'}</div>
            </div>
            <div class="user-detail-item">
                <div class="user-detail-label">Specific Type</div>
                <div class="user-detail-value">${userData.rawData?.specificType || 'N/A'}</div>
            </div>
        `;
    } else if (userType === 'civilian') {
        const firstName = userData.rawData?.firstName || userData.rawData?.firstname || 'N/A';
        const lastName = userData.rawData?.lastName || userData.rawData?.lastname || 'N/A';
        
        detailsHTML += `
            <div class="user-detail-item">
                <div class="user-detail-label">First Name</div>
                <div class="user-detail-value">${firstName}</div>
            </div>
            <div class="user-detail-item">
                <div class="user-detail-label">Last Name</div>
                <div class="user-detail-value">${lastName}</div>
            </div>
        `;
        
        if (userData.rawData?.dob) {
            detailsHTML += `
                <div class="user-detail-item">
                    <div class="user-detail-label">Date of Birth</div>
                    <div class="user-detail-value">${userData.rawData.dob}</div>
                </div>
            `;
        }
        
        if (userData.rawData?.phone) {
            detailsHTML += `
                <div class="user-detail-item">
                    <div class="user-detail-label">Phone</div>
                    <div class="user-detail-value code">${userData.rawData.phone}</div>
                </div>
            `;
        }
        
        if (userData.rawData?.address) {
            detailsHTML += `
                <div class="user-detail-item">
                    <div class="user-detail-label">Address</div>
                    <div class="user-detail-value">${userData.rawData.address}</div>
                </div>
            `;
        }
    }
    
    // Timestamps and IDs
    let timestampText = 'N/A';
    const timestamp = userData.lastActive || userData.rawData?.timestamp;
    if (timestamp) {
        try {
            let date;
            if (timestamp.toDate) {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else {
                date = new Date(timestamp);
            }
            
            if (date && !isNaN(date.getTime())) {
                timestampText = date.toLocaleString();
            }
        } catch (error) {
            console.error('Error parsing timestamp:', error);
        }
    }
    
    detailsHTML += `
        <div class="user-detail-item">
            <div class="user-detail-label">Last Active</div>
            <div class="user-detail-value">${timestampText}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">Document ID</div>
            <div class="user-detail-value code">${userData.id}</div>
        </div>
    `;
    
    // Civilian Association (for units)
    if (userType === 'unit') {
        if (userData.hasAssociation && userData.civilianName) {
            detailsHTML += `
                <div class="user-detail-item" style="grid-column: 1 / -1;">
                    <div class="user-detail-label">Associated Civilian</div>
                    <div class="user-detail-value" style="color: #28a745;">
                        ✓ ${userData.civilianName} (${userData.civilianId})
                    </div>
                </div>
            `;
        } else {
            detailsHTML += `
                <div class="user-detail-item" style="grid-column: 1 / -1;">
                    <div class="user-detail-label">Associated Civilian</div>
                    <div class="user-detail-value" style="color: #f39c12;">
                        ⚠ No civilian association found
                    </div>
                </div>
            `;
        }
    }
    
    // Enhancement Status
    detailsHTML += `
        <div class="user-detail-item" style="grid-column: 1 / -1;">
            <div class="user-detail-label">Data Enhancement</div>
            <div class="user-detail-value">
                ${userData.enhanced ? 
                    `<span style="color: #28a745;">✓ Enhanced from ${userData.enhancedFrom || 'logs'}</span>` : 
                    `<span style="color: #f39c12;">⚠ No additional data found</span>`}
            </div>
        </div>
    `;
    
    detailsHTML += '</div>';
    
    // Set the content
    contentDiv.innerHTML = detailsHTML;
    
    // Show modal with animation
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

// Close user details modal
window.closeUserDetailsModal = function() {
    const modal = document.getElementById('userDetailsModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
};

// Add click outside to close modals
document.addEventListener('click', function(e) {
    // Close message modal when clicking outside
    if (e.target.id === 'messageModal') {
        closeMessageModal();
    }
    
    // Close user details modal when clicking outside  
    if (e.target.id === 'userDetailsModal') {
        closeUserDetailsModal();
    }
});

// Add escape key to close modals
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeMessageModal();
        closeUserDetailsModal();
    }
});

window.viewCallDetails = async function(callId) {
    try {
        // Show the call details panel
        const panel = document.getElementById('callDetailsPanel');
        if (panel) panel.style.display = '';

        const basicInfoEl = document.getElementById('callBasicInfo');
        if (!basicInfoEl) {
            console.warn('[ADMIN] callBasicInfo element not found');
            showNotification(`Viewing call ${callId}`, 'info');
            return;
        }

        // Fetch call document
        const callRef = doc(db, 'calls', callId);
        const callSnap = await getDoc(callRef);
        if (!callSnap.exists()) {
            showNotification('Call not found', 'error');
            return;
        }

        const callData = callSnap.data();

        // Format timestamp
        let formattedTimestamp = 'Unknown';
        if (callData.timestamp) {
            const ts = callData.timestamp.toDate ? callData.timestamp.toDate() : new Date(callData.timestamp);
            formattedTimestamp = `${ts.toLocaleTimeString('en-GB')} ${ts.toLocaleDateString('en-GB')}`;
        }

        // Render a compact call card instead of a plain list
        const serviceText = callData.service || callData.serviceType || 'Multiple';
        // Show call status in the second badge (user requested status instead of type)
        const statusText = callData.status || callData.callStatus || callData.state || 'Unknown';
        const statusClass = (statusText || 'unknown').toString().toLowerCase().replace(/\s+/g, '-');

        basicInfoEl.innerHTML = `
            <div class="call-basic-card">
                <div class="call-basic-top">
                    <div class="call-id">Call ID: <span class="code">${callId}</span></div>
                    <div class="call-badges">
                        <span class="badge service ${(serviceText||'').toString().toLowerCase().replace(/\s+/g,'-')}">${serviceText}</span>
                        <span class="badge status ${statusClass}">${statusText}</span>
                    </div>
                </div>

                <div class="call-basic-grid">
                    <div class="call-field">
                        <div class="label">Caller</div>
                        <div class="value">${callData.callerName || 'Unknown'}</div>
                    </div>
                    <div class="call-field">
                        <div class="label">Location</div>
                        <div class="value">${callData.location || 'Unknown'}</div>
                    </div>
                    <div class="call-field">
                        <div class="label">Time</div>
                        <div class="value">${formattedTimestamp}</div>
                    </div>
                    <div class="call-field description-field" style="grid-column: 1 / -1;">
                        <div class="label">Description</div>
                        <div class="value description">${(callData.description || '').replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            </div>
        `;

        // Render attached units as tiles (reuse dispatch unit-card style)
        const attachedContainer = document.getElementById('callAttachedUnits');
        if (!attachedContainer) {
            console.warn('[ADMIN] callAttachedUnits container not found');
            return;
        }

        // Clear previous
        attachedContainer.innerHTML = '';

        // Query attachedUnit collection
        const attachedQuery = query(collection(db, 'attachedUnit'), where('callID', '==', callId));
        const attachedSnap = await getDocs(attachedQuery);

        if (attachedSnap.empty) {
            attachedContainer.innerHTML = '<p>No Attached Units</p>';
            return;
        }

        // Fetch unit docs and render tiles
        const seen = new Set();
        for (const docSnap of attachedSnap.docs) {
            const { unitID } = docSnap.data();
            if (!unitID || seen.has(unitID)) continue;
            seen.add(unitID);

            try {
                const unitRef = doc(db, 'units', unitID);
                const unitDoc = await getDoc(unitRef);
                if (!unitDoc.exists()) continue;
                const unitData = unitDoc.data();
                const callsign = (unitData.callsign || 'N/A').trim();
                const unitType = unitData.unitType || 'Unknown';
                const specificType = unitData.specificType || '';
                const status = unitData.status || 'Unknown';

                const statusColor = getStatusColor(status);
                const unitTypeColor = getUnitTypeColor(unitType);
                const textColor = getContrastingTextColor(statusColor);

                const serviceAbbr = (unitType.substring(0,3) || 'UNK').toUpperCase();

                // Detailed tile for Call Details view
                const unitDiv = document.createElement('div');
                unitDiv.className = 'unit-card call-detail';
                unitDiv.dataset.unitId = unitID;
                unitDiv.style.backgroundColor = '#ffffff';
                unitDiv.style.color = '#222';
                unitDiv.style.borderLeft = `6px solid ${statusColor}`;
                unitDiv.style.setProperty('--unit-type-color', unitTypeColor);
                unitDiv.style.setProperty('--text-color', textColor);
                unitDiv.innerHTML = `
                    <div class="call-detail-unit-top" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                            <span class="unit-service-abbr" style="background:${unitTypeColor};color:${getContrastingTextColor(unitTypeColor)};padding:8px 12px;border-radius:999px;font-weight:800;">${serviceAbbr}</span>
                            <div style="display:flex;flex-direction:column;min-width:0;">
                                <span class="unit-specific-type" style="font-size:1.08rem;font-weight:800;color:#222;white-space:nowrap;">${specificType || unitType}</span>
                                <span class="unit-callsign-box" style="font-family:'Courier New', monospace;font-weight:900;font-size:1.02rem;color:#111;margin-top:6px;">${callsign} - ${status}</span>
                            </div>
                        </div>
                    </div>
                    <div class="call-detail-unit-meta" style="margin-top:10px;font-size:0.92rem;color:#444;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
                            <span class="unit-status-label ${status.toLowerCase().replace(/\s/g, '-')}" style="display:inline-block;background:${statusColor};color:${getContrastingTextColor(statusColor)};padding:6px 10px;border-radius:8px;font-weight:800;">${status}</span>
                            <div style="font-size:0.85rem;color:#666;">ID: ${unitID}</div>
                        </div>
                        <div style="color:#666;margin-left:12px;flex:1;text-align:right;min-width:0;">
                            ${unitData.lastKnownLocation ? `Last seen: ${unitData.lastKnownLocation}` : ''}
                        </div>
                    </div>
                `;

                // Clicking a detailed tile opens unit details
                unitDiv.addEventListener('click', () => {
                    if (typeof viewUserDetails === 'function') {
                        viewUserDetails(unitID, 'unit');
                    }
                });

                attachedContainer.appendChild(unitDiv);
            } catch (e) {
                console.error('[ADMIN] Error rendering attached unit', e);
            }
        }

                // Load call-specific logs into the Call Logs Panel
                try {
                    const logsPanel = document.getElementById('callLogsPanel');
                    const logsContainer = document.getElementById('callLogsTable');
                    if (logsPanel && logsContainer) {
                        logsPanel.style.display = '';
                        logsContainer.innerHTML = '<div class="loading-cell">Loading call logs...</div>';

                        const logsRef = collection(db, 'logs');
                        const logsQ = query(logsRef, where('callId', '==', callId), orderBy('timestamp', 'desc'));
                        const logsSnap = await getDocs(logsQ);

                        if (logsSnap.empty) {
                            logsContainer.innerHTML = '<div class="no-logs-message">No logs found for this call.</div>';
                        } else {
                            const listEl = document.createElement('div');
                            listEl.className = 'call-log-list';
                            logsSnap.forEach(logDoc => {
                                const d = logDoc.data();
                                let ts = '';
                                if (d.timestamp?.toDate) ts = d.timestamp.toDate().toLocaleString();
                                else if (d.timestamp instanceof Date) ts = d.timestamp.toLocaleString();
                                else ts = '';

                                const item = document.createElement('div');
                                item.className = 'call-log-item';
                                item.innerHTML = `
                                    <div class="call-log-time">${ts}</div>
                                    <div class="call-log-entry"><strong>${d.action || 'Log'}</strong>: ${d.details || d.message || ''} <span class="call-log-meta">${d.callsign ? '• ' + d.callsign : ''} ${d.serviceType ? '• ' + d.serviceType : ''}</span></div>
                                `;
                                listEl.appendChild(item);
                            });

                            logsContainer.innerHTML = '';
                            logsContainer.appendChild(listEl);
                        }
                    }
                } catch (e) {
                    console.error('[ADMIN] Error loading call logs for', callId, e);
                }

    } catch (error) {
        console.error('Error in viewCallDetails:', error);
        showNotification('Error loading call details', 'error');
    }
};

// Render attached units inside the call card's scroll area (admin-specific)
async function adminRenderAttachedUnitsForCall(callId) {
    try {
        const container = document.getElementById(`attached-units-${callId}`);
        if (!container) return;

        // Clear existing
        while (container.firstChild) container.removeChild(container.firstChild);

        const attachedQuery = query(collection(db, 'attachedUnit'), where('callID', '==', callId));
        const attachedSnap = await getDocs(attachedQuery);

        if (attachedSnap.empty) {
            const el = document.createElement('div');
            el.textContent = 'No Attached Units';
            el.style.padding = '6px 12px';
            el.style.opacity = '0.7';
            container.appendChild(el);
            return;
        }

        const seen = new Set();
        for (const docSnap of attachedSnap.docs) {
            const { unitID } = docSnap.data();
            if (!unitID || seen.has(unitID)) continue;
            seen.add(unitID);

            try {
                const unitRef = doc(db, 'units', unitID);
                const unitDoc = await getDoc(unitRef);
                if (!unitDoc.exists()) continue;
                const unitData = unitDoc.data();

                const callsign = (unitData.callsign || 'N/A').trim();
                const unitType = unitData.unitType || 'Unknown';
                const specificType = unitData.specificType || '';
                const status = unitData.status || 'Unknown';

                const statusColor = getStatusColor(status);
                const unitTypeColor = getUnitTypeColor(unitType);
                const textColor = getContrastingTextColor(statusColor);

                const serviceAbbr = (unitType.substring(0,3) || 'UNK').toUpperCase();

                const pill = document.createElement('div');
                pill.className = 'unit-card';
                pill.dataset.unitId = unitID;
                pill.style.backgroundColor = '#ffffff';
                pill.style.color = '#222';
                pill.style.borderLeft = `6px solid ${statusColor}`;
                pill.style.setProperty('--unit-type-color', unitTypeColor);
                pill.style.setProperty('--text-color', textColor);
                pill.innerHTML = `
                    <span class="unit-main">
                        <span class="unit-service-abbr" style="background:${unitTypeColor};color:${getContrastingTextColor(unitTypeColor)};">${serviceAbbr}</span>
                        <span class="unit-specific-type">${specificType}<span class="unit-callsign-inline"><br>${callsign} - ${status}</span></span>
                    </span>
                `;

                pill.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent selecting the call
                    if (typeof viewUserDetails === 'function') viewUserDetails(unitID, 'unit');
                });

                container.appendChild(pill);
            } catch (e) {
                console.error('[ADMIN] Error fetching unit for attachedUnit doc', e);
            }
        }
    } catch (error) {
        console.error('[ADMIN] adminRenderAttachedUnitsForCall error:', error);
    }
}

window.updateCallStatus = function(callId) {
    showNotification(`Updating status for call: ${callId}`, 'info');
};

// Debug function to check database structure (call from console)
window.checkUserCollections = async function() {
    console.log('=== CHECKING USER COLLECTIONS ===');
    
    try {
        // Check dispatchers
        const dispatchersRef = collection(db, 'dispatchers');
        const dispatchersSnapshot = await getDocs(dispatchersRef);
        console.log(`Dispatchers collection: ${dispatchersSnapshot.size} documents`);
        dispatchersSnapshot.forEach(doc => {
            console.log('Dispatcher doc:', doc.id, doc.data());
        });
        
        // Check civilians
        const civiliansRef = collection(db, 'civilians');
        const civiliansSnapshot = await getDocs(civiliansRef);
        console.log(`Civilians collection: ${civiliansSnapshot.size} documents`);
        civiliansSnapshot.forEach(doc => {
            console.log('Civilian doc:', doc.id, doc.data());
        });
        
        // Check units
        const unitsRef = collection(db, 'units');
        const unitsSnapshot = await getDocs(unitsRef);
        console.log(`Units collection: ${unitsSnapshot.size} documents`);
        unitsSnapshot.forEach(doc => {
            console.log('Unit doc:', doc.id, doc.data());
        });
        
    } catch (error) {
        console.error('Error checking collections:', error);
    }
    
    console.log('=== END COLLECTION CHECK ===');
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopDashboardRealTimeListeners();
    unsubscribeListeners.forEach(unsubscribe => unsubscribe());
});

// Debug function to check what's in each collection
window.debugCollections = async function() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        console.log('=== DEBUGGING COLLECTIONS ===');
        
        // Check dispatchers
        const dispatchersRef = collection(db, 'dispatchers');
        const dispatchersSnapshot = await getDocs(dispatchersRef);
        console.log(`Dispatchers collection: ${dispatchersSnapshot.size} documents`);
        dispatchersSnapshot.forEach(doc => {
            console.log('Dispatcher:', doc.id, doc.data());
        });
        
        // Check civilians
        const civiliansRef = collection(db, 'civilians');
        const civiliansSnapshot = await getDocs(civiliansRef);
        console.log(`Civilians collection: ${civiliansSnapshot.size} documents`);
        civiliansSnapshot.forEach(doc => {
            console.log('Civilian:', doc.id, doc.data());
        });
        
        // Check units
        const unitsRef = collection(db, 'units');
        const unitsSnapshot = await getDocs(unitsRef);
        console.log(`Units collection: ${unitsSnapshot.size} documents`);
        unitsSnapshot.forEach(doc => {
            console.log('Unit:', doc.id, doc.data());
        });
        
        console.log('=== END DEBUG ===');
        
    } catch (error) {
        console.error('Error debugging collections:', error);
    }
};

// ===== UTILITY AND DEBUG FUNCTIONS =====

// Test messaging system audio
window.testPriorityTones = function() {
    console.log('Testing priority tones...');
    
    setTimeout(() => {
        console.log('Playing INFO tone');
        playPriorityTone('info');
    }, 500);
    
    setTimeout(() => {
        console.log('Playing URGENT tone');
        playPriorityTone('urgent');
    }, 2000);
    
    setTimeout(() => {
        console.log('Playing EMERGENCY tone');
        playPriorityTone('emergency');
    }, 4000);
    
    showNotification('Testing priority tones - check console', 'info');
};

// Test message sending to a specific user (for debugging)
window.testSendMessage = function(priority = 'info') {
    if (currentEnhancedUsers.length === 0) {
        showNotification('No users available for testing', 'warning');
        return;
    }
    
    const testUser = currentEnhancedUsers[0]; // Use first user
    console.log('Testing message send to:', testUser);
    
    // Simulate opening modal and sending a test message
    sendUserMessage(testUser.id, testUser.username);
    
    // Auto-fill a test message after modal opens
    setTimeout(() => {
        const messageContent = document.getElementById('messageContent');
        const messagePriority = document.getElementById('messagePriority');
        
        if (messageContent && messagePriority) {
            messageContent.value = `Test ${priority} message sent at ${new Date().toLocaleTimeString()}`;
            messagePriority.value = priority;
            updateCharacterCount();
            
            console.log('Test message auto-filled. Click Send to complete test.');
            showNotification('Test message auto-filled - click Send to complete', 'info');
        }
    }, 500);
};

// Function to check if users have pending admin messages
window.checkPendingMessages = async function() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }
    
    try {
        console.log('Checking for users with pending admin messages...');
        
        const userCollections = ['units', 'dispatchers', 'civilians'];
        let totalPendingMessages = 0;
        
        for (const collectionName of userCollections) {
            const collectionRef = collection(db, collectionName);
            const snapshot = await getDocs(collectionRef);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.adminMessages && data.adminMessages.length > 0) {
                    console.log(`${collectionName}/${doc.id} has ${data.adminMessages.length} admin messages`);
                    totalPendingMessages += data.adminMessages.length;
                    
                    // Show recent messages
                    data.adminMessages.slice(0, 3).forEach((msg, index) => {
                        console.log(`  Message ${index + 1}: [${msg.priority}] ${msg.content}`);
                    });
                }
            });
        }
        
        console.log(`Total pending admin messages across all users: ${totalPendingMessages}`);
        showNotification(`Found ${totalPendingMessages} pending admin messages`, 'info');
        
        return totalPendingMessages;
        
    } catch (error) {
        console.error('Error checking pending messages:', error);
        showNotification('Error checking pending messages', 'error');
    }
};

// Enhanced user management debugging
window.debugUserManagement = async function() {
    console.log('=== USER MANAGEMENT DEBUG ===');
    
    // Show current enhanced users
    console.log('Current Enhanced Users:', currentEnhancedUsers);
    console.log(`Total enhanced users: ${currentEnhancedUsers.length}`);
    
    // Show breakdown by service
    const serviceBreakdown = {};
    currentEnhancedUsers.forEach(user => {
        serviceBreakdown[user.service] = (serviceBreakdown[user.service] || 0) + 1;
    });
    console.log('Service breakdown:', serviceBreakdown);
    
    // Show enhancement status
    const enhancedCount = currentEnhancedUsers.filter(u => u.enhanced).length;
    const associatedCount = currentEnhancedUsers.filter(u => u.hasAssociation).length;
    
    console.log(`Enhanced users: ${enhancedCount}/${currentEnhancedUsers.length}`);
    console.log(`Units with civilian associations: ${associatedCount}/${currentEnhancedUsers.filter(u => u.type === 'unit').length}`);
    
    // Test messaging system availability
    const messageModal = document.getElementById('messageModal');
    const userDetailsModal = document.getElementById('userDetailsModal');
    
    console.log('Modal availability:');
    console.log(`  Message modal: ${messageModal ? 'Available' : 'Missing'}`);
    console.log(`  User details modal: ${userDetailsModal ? 'Available' : 'Missing'}`);
    
    // Check audio context
    console.log(`Audio context: ${audioContext ? 'Initialized' : 'Not initialized'}`);
    
    showNotification('User management debug info logged to console', 'info');
};

// Function to manually trigger audio context initialization (for testing)
window.initAudio = function() {
    try {
        initializeAudioContext();
        showNotification('Audio context initialized successfully', 'success');
        console.log('Audio context state:', audioContext.state);
    } catch (error) {
        console.error('Error initializing audio:', error);
        showNotification('Failed to initialize audio', 'error');
    }
};

// Quick access function to send broadcast-style messages to all users
window.sendBroadcastMessage = async function(message, priority = 'info') {
    if (!message) {
        message = prompt('Enter broadcast message:');
        if (!message) return;
    }
    
    if (currentEnhancedUsers.length === 0) {
        showNotification('No users available to broadcast to', 'warning');
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    console.log(`Broadcasting ${priority} message to ${currentEnhancedUsers.length} users...`);
    
    for (const user of currentEnhancedUsers) {
        try {
            // Set recipient for this user
            currentMessageRecipient = {
                id: user.id,
                username: user.username,
                service: user.service,
                callsign: user.callsign,
                type: user.type,
                discordName: user.discordName,
                irlName: user.irlName
            };
            
            // Create message data
            const messageData = {
                id: generateMessageId(),
                from: 'Admin',
                to: user.id,
                toUsername: user.username,
                toService: user.service,
                toCallsign: user.callsign,
                priority: priority,
                content: message,
                requireAcknowledgment: false,
                persistent: true,
                timestamp: new Date(),
                status: 'sent',
                acknowledged: false,
                broadcast: true
            };
            
            // Store the message
            await storeMessage(messageData);
            successCount++;
            
        } catch (error) {
            console.error(`Error sending to ${user.username}:`, error);
            errorCount++;
        }
    }
    
    // Reset recipient
    currentMessageRecipient = null;
    
    // Play tone and show result
    playPriorityTone(priority);
    
    if (errorCount === 0) {
        showNotification(`Broadcast sent to all ${successCount} users successfully`, 'success');
    } else {
        showNotification(`Broadcast sent to ${successCount} users, ${errorCount} failed`, 'warning');
    }
    
    // Log the broadcast action
    await logUserAction(
        'Admin', 
        'System', 
        `sent ${priority} broadcast message`,
        `Content: "${message}" | Recipients: ${successCount} | Errors: ${errorCount}`
    );
    
    console.log(`Broadcast complete: ${successCount} sent, ${errorCount} failed`);
};

// Make key objects globally accessible for console debugging
window.adminDb = db;
window.adminAuth = auth;
window.adminUsers = currentEnhancedUsers;

console.log('🎯 Admin messaging system loaded successfully!');
console.log('Available functions:');
console.log('  • testPriorityTones() - Test audio tones');
console.log('  • testSendMessage() - Test message sending');
console.log('  • checkPendingMessages() - Check for pending messages');
console.log('  • debugUserManagement() - Debug user management');
console.log('  • startDashboardRealTimeListeners() - Start real-time updates');
console.log('  • stopDashboardRealTimeListeners() - Stop real-time updates');
console.log('  • testRealTimeUpdates() - Test real-time dashboard updates');
console.log('Global objects:');
console.log('  • window.adminDb - Firebase database');
console.log('  • window.adminAuth - Firebase auth');
console.log('  • window.adminUsers - Current users array');
console.log('  • sendBroadcastMessage() - Send message to all users');
console.log('  • initAudio() - Initialize audio context');

// Test function for real-time updates
window.testRealTimeUpdates = async function() {
    console.log('🧪 Testing real-time dashboard updates...');
    
    try {
        // Test metric updates
        console.log('📊 Testing metric updates...');
        updateMetricsRealTime();
        
        // Test active calls updates  
        console.log('📞 Testing active calls updates...');
        updateActiveCallsRealTime();
        
        // Test alerts updates
        console.log('🚨 Testing alerts updates...');
        updateRecentAlertsRealTime();
        
        // Test system status updates
        console.log('⚙️ Testing system status updates...');
        updateSystemStatusRealTime();
        
        console.log('✅ Real-time update test completed! Check the dashboard for visual changes.');
        
        // Show current listener status
        const listenerCount = window.dashboardListeners ? window.dashboardListeners.length : 0;
        console.log(`📡 Currently monitoring ${listenerCount} real-time listeners`);
        
    } catch (error) {
        console.error('❌ Error testing real-time updates:', error);
    }
};

// Add visual indicator for real-time status
function addRealTimeIndicator() {
    // Add real-time indicator to dashboard header if not exists
    const dashboardHeader = document.querySelector('#dashboard .dashboard-grid');
    if (dashboardHeader && !document.getElementById('realTimeIndicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'realTimeIndicator';
        indicator.className = 'real-time-indicator';
        indicator.innerHTML = '<span class="pulse-dot">🔴</span> Live Updates Active';
        document.body.appendChild(indicator);
        console.log('✅ Real-time indicator added to dashboard');
    }
}

// Remove real-time indicator
function removeRealTimeIndicator() {
    const indicator = document.getElementById('realTimeIndicator');
    if (indicator) {
        indicator.remove();
        console.log('❌ Real-time indicator removed');
    }
}

// Start real-time indicator when dashboard loads
setTimeout(() => {
    if (currentTab === 'dashboard') {
        addRealTimeIndicator();
    }
}, 2000);