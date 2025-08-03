// admin/admin.js
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Global state
let currentTab = 'dashboard';
let autoRefreshInterval = null;
let isAutoRefresh = true;
let unsubscribeListeners = [];

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializeLogout();
    loadDashboard();
    
    // Check if user is authenticated
    if (!sessionStorage.getItem('adminAuthenticated')) {
        window.location.href = '../index.html';
        return;
    }

    // Start auto-refresh for live data
    startAutoRefresh();
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
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabId}-tab`).classList.add('active');

    // Load tab-specific data
    currentTab = tabId;
    loadTabData(tabId);
}

function loadTabData(tabId) {
    switch(tabId) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'live-activity':
            loadLiveActivity();
            break;
        case 'users':
            loadUsers();
            break;
        case 'calls':
            loadCalls();
            break;
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
    try {
        showLoading();
        
        // Load metrics
        const [totalUsers, activeCalls, totalCalls] = await Promise.all([
            getUserCount(),
            getActiveCallsCount(),
            getTotalCallsCount()
        ]);

        // Update metrics
        document.getElementById('total-users').textContent = totalUsers;
        document.getElementById('active-calls').textContent = activeCalls;
        document.getElementById('total-calls').textContent = totalCalls;

        // Load service status
        await loadServiceStatus();
        
        // Load recent activity
        await loadRecentActivity();

        hideLoading();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Error loading dashboard data', 'error');
        hideLoading();
    }
}

async function getUserCount() {
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting user count:', error);
        return 0;
    }
}

async function getActiveCallsCount() {
    try {
        const callsRef = collection(db, 'calls');
        const activeQuery = query(callsRef, where('status', '==', 'active'));
        const snapshot = await getDocs(activeQuery);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting active calls count:', error);
        return 0;
    }
}

async function getTotalCallsCount() {
    try {
        const callsRef = collection(db, 'calls');
        const snapshot = await getDocs(callsRef);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting total calls count:', error);
        return 0;
    }
}

async function loadServiceStatus() {
    const services = ['police', 'fire', 'ambulance', 'dispatch', 'civilian'];
    const serviceContainer = document.querySelector('.service-grid');
    
    serviceContainer.innerHTML = '';
    
    for (const service of services) {
        try {
            const usersRef = collection(db, 'users');
            const serviceQuery = query(usersRef, where('service', '==', service));
            const snapshot = await getDocs(serviceQuery);
            
            const serviceElement = document.createElement('div');
            serviceElement.className = 'service-status';
            serviceElement.innerHTML = `
                <div class="service-icon">${getServiceIcon(service)}</div>
                <div class="service-name">${service.charAt(0).toUpperCase() + service.slice(1)}</div>
                <div class="service-count">${snapshot.size}</div>
            `;
            
            serviceContainer.appendChild(serviceElement);
        } catch (error) {
            console.error(`Error loading ${service} status:`, error);
        }
    }
}

function getServiceIcon(service) {
    const icons = {
        police: '👮',
        fire: '🚒',
        ambulance: '🚑',
        dispatch: '📞',
        civilian: '👤'
    };
    return icons[service] || '❓';
}

async function loadRecentActivity() {
    try {
        const activityRef = collection(db, 'activity');
        const recentQuery = query(activityRef, orderBy('timestamp', 'desc'), limit(10));
        const snapshot = await getDocs(recentQuery);
        
        const activityFeed = document.getElementById('activity-feed');
        activityFeed.innerHTML = '';
        
        if (snapshot.empty) {
            activityFeed.innerHTML = '<div class="activity-item">No recent activity</div>';
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'activity-item';
            
            const timestamp = data.timestamp?.toDate() || new Date();
            const timeString = timestamp.toLocaleTimeString();
            
            item.innerHTML = `
                <div class="activity-time">${timeString}</div>
                <div class="activity-text">${data.message || 'Unknown activity'}</div>
            `;
            
            activityFeed.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading recent activity:', error);
        document.getElementById('activity-feed').innerHTML = '<div class="activity-item">Error loading activity</div>';
    }
}

// Live Activity Functions
function loadLiveActivity() {
    // Clear existing listeners
    unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    unsubscribeListeners = [];

    // Set up real-time listener for activity
    const activityRef = collection(db, 'activity');
    const liveQuery = query(activityRef, orderBy('timestamp', 'desc'), limit(50));
    
    const unsubscribe = onSnapshot(liveQuery, (snapshot) => {
        const feed = document.getElementById('live-activity-feed');
        feed.innerHTML = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'activity-item';
            
            const timestamp = data.timestamp?.toDate() || new Date();
            const timeString = timestamp.toLocaleTimeString();
            
            item.innerHTML = `
                <div class="activity-time">${timeString}</div>
                <div class="activity-text">${data.message || 'Unknown activity'}</div>
            `;
            
            feed.appendChild(item);
        });
    });
    
    unsubscribeListeners.push(unsubscribe);
}

// User Management Functions
async function loadUsers() {
    try {
        showLoading();
        
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No users found</td></tr>';
            hideLoading();
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const row = document.createElement('tr');
            
            const lastSeen = data.lastSeen?.toDate()?.toLocaleString() || 'Never';
            const status = data.online ? 'Online' : 'Offline';
            
            row.innerHTML = `
                <td>${data.name || 'Unknown'}</td>
                <td>${data.service || 'Unknown'}</td>
                <td><span class="status-badge ${status.toLowerCase()}">${status}</span></td>
                <td>${lastSeen}</td>
                <td>
                    <button class="control-btn" onclick="viewUserDetails('${doc.id}')">View</button>
                    <button class="control-btn danger" onclick="disconnectUser('${doc.id}')">Disconnect</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        hideLoading();
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Error loading users', 'error');
        hideLoading();
    }
}

// Call Management Functions
async function loadCalls() {
    try {
        showLoading();
        
        const callsRef = collection(db, 'calls');
        const callsQuery = query(callsRef, orderBy('timestamp', 'desc'), limit(20));
        const snapshot = await getDocs(callsQuery);
        
        const container = document.getElementById('calls-grid');
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="section-card">No calls found</div>';
            hideLoading();
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const callCard = document.createElement('div');
            callCard.className = 'call-card';
            
            const timestamp = data.timestamp?.toDate()?.toLocaleString() || 'Unknown';
            
            callCard.innerHTML = `
                <h4>Call #${doc.id.slice(-6)}</h4>
                <p><strong>Type:</strong> ${data.type || 'Unknown'}</p>
                <p><strong>Location:</strong> ${data.location || 'Unknown'}</p>
                <p><strong>Status:</strong> ${data.status || 'Unknown'}</p>
                <p><strong>Time:</strong> ${timestamp}</p>
                <div style="margin-top: 12px;">
                    <button class="control-btn primary" onclick="viewCallDetails('${doc.id}')">View Details</button>
                    <button class="control-btn warning" onclick="updateCallStatus('${doc.id}')">Update Status</button>
                </div>
            `;
            
            container.appendChild(callCard);
        });
        
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
    
    autoRefreshInterval = setInterval(() => {
        if (isAutoRefresh && currentTab === 'dashboard') {
            loadDashboard();
        }
    }, 30000); // Refresh every 30 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
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

// Logout functionality
function initializeLogout() {
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            sessionStorage.removeItem('adminAuthenticated');
            window.location.href = '../index.html';
        });
    }
}

// Placeholder functions for button actions
window.viewUserDetails = function(userId) {
    showNotification(`Viewing details for user: ${userId}`, 'info');
};

window.disconnectUser = function(userId) {
    if (confirm('Are you sure you want to disconnect this user?')) {
        showNotification(`User ${userId} disconnected`, 'warning');
    }
};

window.viewCallDetails = function(callId) {
    showNotification(`Viewing details for call: ${callId}`, 'info');
};

window.updateCallStatus = function(callId) {
    showNotification(`Updating status for call: ${callId}`, 'info');
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    unsubscribeListeners.forEach(unsubscribe => unsubscribe());
});
