// messaging-system.js
// Centralized messaging system for admin and all service pages

import { db } from "./firebase/firebase.js";
import {
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { logUserAction } from "./firebase/logUserAction.js";

// Global messaging state
let currentMessageRecipient = null;
let messageListeners = [];
let audioContext = null;
let isAudioInitialized = false;
let activeAudioIntervals = new Set(); // Track active repeating tones

// Audio priority frequencies (Hz)
const PRIORITY_FREQUENCIES = {
    info: 440,      // A4 note
    urgent: 880,    // A5 note  
    critical: 1760, // A6 note
    emergency: 2217 // High pitched emergency tone
};

// ================================
// CORE MESSAGING FUNCTIONS
// ================================

/**
 * Initialize the messaging system
 * @param {Object} config - Configuration options
 * @param {string} config.userType - Type of user (admin, ambulance, police, etc.)
 * @param {string} config.userId - Current user's ID
 * @param {string} config.userCallsign - Current user's callsign
 */
export function initializeMessaging(config = {}) {
    console.log('🚀 Initializing messaging system...', config);
    
    // Normalize config properties (handle both id/userId and type/userType)
    const normalizedConfig = {
        userId: config.userId || config.id,
        userType: config.userType || config.type,
        userCallsign: config.userCallsign || config.name,
        canSendMessages: config.canSendMessages,
        canReceiveMessages: config.canReceiveMessages
    };
    
    console.log('🔍 DEBUG: Normalized config:', normalizedConfig);
    
    // Validate required fields
    if (!normalizedConfig.userId || !normalizedConfig.userType) {
        console.error('❌ Invalid messaging config: missing userId or userType', normalizedConfig);
        return;
    }
    
    // Store user config globally
    window.messagingConfig = normalizedConfig;
    
    // Initialize audio context
    initializeAudioContext();
    
    // Set up message listeners based on user type
    if (normalizedConfig.userType !== 'admin') {
        setupMessageListener(normalizedConfig.userId, normalizedConfig.userType);
    }
    
    // Make functions globally available
    window.sendUserMessage = sendUserMessage;
    window.sendMessage = sendMessage;
    window.closeMessageModal = closeMessageModal;
    window.playPriorityTone = playPriorityTone;
    window.acknowledgeMessage = acknowledgeMessage;
    window.dismissMessage = dismissMessage;
    window.markMessageAsRead = markMessageAsRead;
    window.markAllMessagesAsRead = markAllMessagesAsRead;
    
    console.log('✅ Messaging system initialized');
}

/**
 * Open message modal for sending a message to a specific user
 * @param {string} userId - Target user ID
 * @param {string} username - Target user display name
 * @param {string} service - Target user service type
 * @param {string} callsign - Target user callsign
 */
export function sendUserMessage(userId, username, service = '', callsign = '') {
    console.log(`📤 Opening message modal for: ${username} (${userId})`);
    
    // Store recipient information
    currentMessageRecipient = {
        id: userId,
        username: username,
        service: service,
        callsign: callsign,
        type: determineUserType(service)
    };
    
    // Check if we have an existing admin modal
    let modal = document.getElementById('messageModal');
    if (!modal) {
        // Create new modal for other pages
        createMessageModal();
        modal = document.getElementById('messageModal');
    }
    
    // Populate recipient information (works with both admin and new modal structures)
    updateModalRecipientInfo(currentMessageRecipient);
    
    // Show modal with animation (compatible with admin CSS)
    modal.style.display = 'flex';
    console.log('🔍 Modal display set to flex');
    
    // Use the admin CSS animation pattern
    setTimeout(() => {
        modal.classList.add('show');
        console.log('🔍 Show class added to modal');
        console.log('🔍 Modal computed style:', window.getComputedStyle(modal).display);
        console.log('🔍 Modal computed opacity:', window.getComputedStyle(modal).opacity);
    }, 10);
    
    // Focus on message content
    setTimeout(() => {
        const messageContent = document.getElementById('messageContent');
        if (messageContent) {
            messageContent.focus();
        }
    }, 300);
    
    console.log('✅ Message modal opened');
}

/**
 * Send the composed message
 */
export async function sendMessage() {
    if (!currentMessageRecipient) {
        console.error('❌ No message recipient set');
        showNotification('No recipient selected', 'error');
        return;
    }
    
    const messageContent = document.getElementById('messageContent')?.value?.trim();
    const priority = document.getElementById('messagePriority')?.value || 'info';
    const requireAck = document.getElementById('requireAcknowledgment')?.checked || false;
    const persistent = document.getElementById('persistentMessage')?.checked || false;
    
    if (!messageContent) {
        showNotification('Please enter a message', 'error');
        return;
    }
    
    try {
        console.log('📨 Sending message...');
        
        // Play priority tone
        await playPriorityTone(priority);
        
        // Generate message ID
        const messageId = generateMessageId();
        
        // Prepare message data
        const messageData = {
            id: messageId,
            from: window.messagingConfig?.userId || 'admin',
            fromUsername: window.messagingConfig?.userCallsign || 'Admin',
            fromService: window.messagingConfig?.userType || 'admin',
            to: currentMessageRecipient.id,
            toUsername: currentMessageRecipient.username,
            toService: currentMessageRecipient.service,
            toCallsign: currentMessageRecipient.callsign,
            content: messageContent,
            priority: priority,
            requireAcknowledgment: requireAck,
            persistent: persistent,
            timestamp: Timestamp.now(),
            status: 'sent',
            acknowledged: false,
            dismissed: false
        };
        
        console.log('🔍 DEBUG: Message data being sent:', messageData);
        console.log('🔍 DEBUG: Recipient ID:', currentMessageRecipient.id);
        
        // Store message in Firebase
        await storeMessage(messageData);
        
        // Log the action (pass db instance from Firebase imports)
        await logUserAction(
            db,
            `sent ${priority} message to ${currentMessageRecipient.username}`,
            `Message: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`
        );
        
        // Show success notification
        showNotification(
            `${priority.toUpperCase()} message sent to ${currentMessageRecipient.username}`, 
            'success'
        );
        
        // Close modal
        closeMessageModal();
        
        console.log('✅ Message sent successfully');
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        showNotification('Failed to send message: ' + error.message, 'error');
    }
}

/**
 * Close the message modal
 */
export function closeMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.style.display = 'none';
        
        // Clear form
        const messageContent = document.getElementById('messageContent');
        const priority = document.getElementById('messagePriority');
        const requireAck = document.getElementById('requireAcknowledgment');
        const persistent = document.getElementById('persistentMessage');
        
        if (messageContent) messageContent.value = '';
        if (priority) priority.value = 'info';
        if (requireAck) requireAck.checked = false;
        if (persistent) persistent.checked = false;
    }
    
    // Clear recipient
    currentMessageRecipient = null;
}

// ================================
// MESSAGE RECEIVING FUNCTIONS
// ================================

/**
 * Set up real-time listener for incoming messages
 * @param {string} userId - Current user's ID
 * @param {string} userType - Current user's type
 */
export function setupMessageListener(userId, userType) {
    if (!db) {
        console.warn('⚠️ Database not available for message listener');
        return;
    }
    
    console.log(`👂 Setting up message listener for ${userType} user: ${userId}`);
    console.log('🔍 DEBUG: Ambulance listening for messages with to ==', userId);
    
    try {
        // Listen for messages sent to this user
        const messagesRef = collection(db, 'messages');
        const userMessagesQuery = query(
            messagesRef, 
            where('to', '==', userId),
            where('dismissed', '==', false),
            where('acknowledged', '==', false), // Only get unacknowledged messages
            orderBy('timestamp', 'desc'),
            limit(50)
        );
        
        const unsubscribe = onSnapshot(userMessagesQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const messageData = change.doc.data();
                    handleIncomingMessage(messageData);
                }
            });
        }, (error) => {
            console.error('❌ Error in message listener:', error);
        });
        
        // Store unsubscribe function
        messageListeners.push(unsubscribe);
        
        console.log('✅ Message listener active');
        
    } catch (error) {
        console.error('❌ Error setting up message listener:', error);
    }
}

/**
 * Handle incoming message
 * @param {Object} messageData - Message data from Firebase
 */
function handleIncomingMessage(messageData) {
    console.log('📬 Incoming message:', messageData);
    
    // Play priority tone with message ID for repeating patterns
    playPriorityTone(messageData.priority, messageData.id);
    
    // Show message notification/modal
    displayIncomingMessage(messageData);
    
    // Log message receipt
    logUserAction(
        db,
        'received message',
        `From: ${messageData.fromUsername} (${messageData.priority})`
    );
}

/**
 * Display incoming message to user
 * @param {Object} messageData - Message data
 */
function displayIncomingMessage(messageData) {
    // Create or update incoming message modal
    let modal = document.getElementById('incomingMessageModal');
    if (!modal) {
        createIncomingMessageModal();
        modal = document.getElementById('incomingMessageModal');
    }
    
    // Populate message content
    updateIncomingMessageContent(messageData);
    
    // Show modal
    modal.style.display = 'flex';
    
    // Add priority class for styling
    modal.className = `modal-overlay incoming-message priority-${messageData.priority}`;
    
    // Auto-dismiss if not persistent and not requiring acknowledgment
    if (!messageData.persistent && !messageData.requireAcknowledgment) {
        setTimeout(() => {
            stopRepeatingTone(messageData.id); // Stop tone before dismissing
            dismissMessage(messageData.id);
        }, getPriorityDisplayTime(messageData.priority));
    }
}

/**
 * Acknowledge a message
 * @param {string} messageId - Message ID to acknowledge
 */
export async function acknowledgeMessage(messageId) {
    try {
        console.log('✅ Acknowledging message:', messageId);
        
        // Stop repeating tone for this message
        stopRepeatingTone(messageId);
        
        // First check if the message document exists
        const messageRef = doc(db, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) {
            console.warn('⚠️ Message document does not exist:', messageId);
            // Handle gracefully - hide modal and show notification
            const modal = document.getElementById('incomingMessageModal');
            if (modal) {
                modal.style.display = 'none';
            }
            showNotification('Message no longer available', 'info');
            return;
        }
        
        // Update message in Firebase
        await updateDoc(messageRef, {
            acknowledged: true,
            acknowledgedAt: Timestamp.now(),
            acknowledgedBy: window.messagingConfig?.userId || 'unknown',
            read: true, // Also mark as read when acknowledged
            readAt: Timestamp.now(),
            readBy: window.messagingConfig?.userId || 'unknown'
        });
        
        // Hide modal
        const modal = document.getElementById('incomingMessageModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Log acknowledgment
        await logUserAction(
            db,
            'acknowledged message',
            `Message ID: ${messageId}`
        );
        
        showNotification('Message acknowledged', 'success');
        
    } catch (error) {
        console.error('❌ Error acknowledging message:', error);
        showNotification('Failed to acknowledge message', 'error');
    }
}

/**
 * Dismiss a message
 * @param {string} messageId - Message ID to dismiss
 */
export async function dismissMessage(messageId) {
    try {
        console.log('🗑️ Dismissing message:', messageId);
        
        // Stop repeating tone for this message
        stopRepeatingTone(messageId);
        
        // First check if the message document exists
        const messageRef = doc(db, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) {
            console.warn('⚠️ Message document does not exist:', messageId);
            // Handle gracefully - hide modal
            const modal = document.getElementById('incomingMessageModal');
            if (modal) {
                modal.style.display = 'none';
            }
            return;
        }
        
        // Update message in Firebase
        await updateDoc(messageRef, {
            dismissed: true,
            dismissedAt: Timestamp.now(),
            dismissedBy: window.messagingConfig?.userId || 'unknown'
        });
        
        // Hide modal
        const modal = document.getElementById('incomingMessageModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        console.log('✅ Message dismissed');
        
    } catch (error) {
        console.error('❌ Error dismissing message:', error);
    }
}

// ================================
// AUDIO FUNCTIONS
// ================================

/**
 * Initialize audio context for priority tones
 */
function initializeAudioContext() {
    if (isAudioInitialized) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        isAudioInitialized = true;
        console.log('🔊 Audio context initialized');
    } catch (error) {
        console.warn('⚠️ Could not initialize audio context:', error);
    }
}

/**
 * Play priority tone based on message priority
 * @param {string} priority - Message priority (info, urgent, critical, emergency)
 * @param {string} messageId - Message ID for tracking repeating tones
 */
export async function playPriorityTone(priority, messageId = null) {
    if (!audioContext || !isAudioInitialized) {
        console.warn('⚠️ Audio context not available');
        return;
    }
    
    try {
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const frequency = PRIORITY_FREQUENCIES[priority] || PRIORITY_FREQUENCIES.info;
        const duration = getPriorityToneDuration(priority);
        
        // For urgent and emergency messages, set up repeating tones
        if ((priority === 'urgent' || priority === 'emergency') && messageId) {
            await playRepeatingTone(priority, frequency, duration, messageId);
        } else {
            // Play single tone for info and critical messages
            await playSingleTone(frequency, duration, priority);
        }
        
        console.log(`🔊 Playing ${priority} tone (${frequency}Hz)`);
        
    } catch (error) {
        console.warn('⚠️ Could not play priority tone:', error);
    }
}

/**
 * Play a single tone
 * @param {number} frequency - Tone frequency
 * @param {number} duration - Tone duration
 * @param {string} priority - Message priority for tone type
 */
async function playSingleTone(frequency, duration, priority) {
    // Create oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Set frequency and type
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = priority === 'emergency' ? 'sawtooth' : 'sine';
    
    // Set volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    // Play tone
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

/**
 * Play repeating tone pattern for urgent/emergency messages
 * @param {string} priority - Message priority
 * @param {number} frequency - Tone frequency
 * @param {number} duration - Individual tone duration
 * @param {string} messageId - Message ID for tracking
 */
async function playRepeatingTone(priority, frequency, duration, messageId) {
    // Stop any existing repeating tone for this message
    stopRepeatingTone(messageId);
    
    const playBurst = async () => {
        // Play 3 quick tones
        for (let i = 0; i < 3; i++) {
            if (!activeAudioIntervals.has(messageId)) return; // Stop if dismissed
            
            await playSingleTone(frequency, duration * 0.3, priority);
            
            // Short pause between tones in burst
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    };
    
    // Mark this tone as active
    activeAudioIntervals.add(messageId);
    
    // Play initial burst
    await playBurst();
    
    // Set up repeating pattern
    const repeatInterval = setInterval(async () => {
        if (!activeAudioIntervals.has(messageId)) {
            clearInterval(repeatInterval);
            return;
        }
        
        await playBurst();
    }, priority === 'emergency' ? 3000 : 5000); // Emergency: 3s, Urgent: 5s
    
    // Store interval reference with the messageId for proper cleanup
    activeAudioIntervals.add(`interval_${messageId}`);
    
    // Also store the actual interval object for direct clearing
    if (!window.activeIntervals) window.activeIntervals = new Map();
    window.activeIntervals.set(messageId, repeatInterval);
    
    console.log(`🔄 Started repeating ${priority} tone pattern for message ${messageId}`);
}

/**
 * Stop repeating tone for a specific message
 * @param {string} messageId - Message ID to stop tones for
 */
function stopRepeatingTone(messageId) {
    if (activeAudioIntervals.has(messageId)) {
        activeAudioIntervals.delete(messageId);
        console.log(`🔇 Stopped repeating tone for message ${messageId}`);
    }
    
    // Clear the actual interval object
    if (window.activeIntervals && window.activeIntervals.has(messageId)) {
        const interval = window.activeIntervals.get(messageId);
        clearInterval(interval);
        window.activeIntervals.delete(messageId);
        console.log(`🔇 Cleared interval for message ${messageId}`);
    }
    
    // Also clear any interval references
    const intervalKey = `interval_${messageId}`;
    if (activeAudioIntervals.has(intervalKey)) {
        activeAudioIntervals.delete(intervalKey);
    }
}

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Store message in Firebase
 * @param {Object} messageData - Message data to store
 */
async function storeMessage(messageData) {
    try {
        // Determine collection based on recipient type
        const collectionName = getMessageCollection(currentMessageRecipient.type);
        
        // Store in messages collection using the custom message ID
        const messageRef = doc(db, 'messages', messageData.id);
        await setDoc(messageRef, messageData);
        
        // Also update the user's document with message reference if needed
        if (collectionName && currentMessageRecipient.id) {
            try {
                const userRef = doc(db, collectionName, currentMessageRecipient.id);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists()) {
                    // Add message to user's messages array or create it
                    const userData = userDoc.data();
                    const userMessages = userData.messages || [];
                    userMessages.push({
                        messageId: messageData.id,
                        timestamp: messageData.timestamp,
                        priority: messageData.priority,
                        from: messageData.fromUsername
                    });
                    
                    await updateDoc(userRef, { 
                        messages: userMessages,
                        lastMessageAt: messageData.timestamp
                    });
                }
            } catch (userUpdateError) {
                console.warn('⚠️ Could not update user document with message:', userUpdateError);
                // Don't fail the whole operation if user update fails
            }
        }
        
        console.log('✅ Message stored in Firebase');
        
    } catch (error) {
        console.error('❌ Error storing message:', error);
        throw new Error(`Failed to store message: ${error.message}`);
    }
}

/**
 * Generate unique message ID
 * @returns {string} Unique message ID
 */
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Determine user type from service
 * @param {string} service - Service name
 * @returns {string} User type
 */
function determineUserType(service) {
    const serviceMap = {
        'Ambulance': 'unit',
        'Police': 'unit', 
        'Fire': 'unit',
        'Dispatch': 'dispatcher',
        'Civilian': 'civilian'
    };
    return serviceMap[service] || 'unit';
}

/**
 * Get message collection name based on user type
 * @param {string} userType - User type
 * @returns {string} Collection name
 */
function getMessageCollection(userType) {
    const collectionMap = {
        'unit': 'units',
        'dispatcher': 'dispatchers',
        'civilian': 'civilians'
    };
    return collectionMap[userType] || 'units';
}

/**
 * Get priority tone duration
 * @param {string} priority - Message priority
 * @returns {number} Duration in seconds
 */
function getPriorityToneDuration(priority) {
    const durations = {
        info: 0.5,
        urgent: 1.0,
        critical: 1.5,
        emergency: 2.0
    };
    return durations[priority] || 0.5;
}

/**
 * Get priority display time for auto-dismiss
 * @param {string} priority - Message priority
 * @returns {number} Display time in milliseconds
 */
function getPriorityDisplayTime(priority) {
    const times = {
        info: 5000,      // 5 seconds
        urgent: 10000,   // 10 seconds
        critical: 15000, // 15 seconds
        emergency: 0     // Never auto-dismiss
    };
    return times[priority] || 5000;
}

/**
 * Update modal with recipient information
 * @param {Object} recipient - Recipient data
 */
function updateModalRecipientInfo(recipient) {
    const recipientName = document.getElementById('recipientName');
    const recipientIcon = document.getElementById('recipientIcon');
    const recipientService = document.getElementById('recipientService');
    
    if (recipientName) recipientName.textContent = recipient.username;
    if (recipientIcon) recipientIcon.textContent = getServiceIcon(recipient.service);
    if (recipientService) recipientService.textContent = recipient.service;
}

/**
 * Update incoming message modal content
 * @param {Object} messageData - Message data
 */
function updateIncomingMessageContent(messageData) {
    const messageFrom = document.getElementById('incomingMessageFrom');
    const messageContent = document.getElementById('incomingMessageContent');
    const messagePriority = document.getElementById('incomingMessagePriority');
    const messageTime = document.getElementById('incomingMessageTime');
    const ackButton = document.getElementById('acknowledgeButton');
    const dismissButton = document.getElementById('dismissButton');
    
    if (messageFrom) messageFrom.textContent = `From: ${messageData.fromUsername}`;
    if (messageContent) messageContent.textContent = messageData.content;
    if (messagePriority) {
        messagePriority.textContent = messageData.priority.toUpperCase();
        messagePriority.className = `priority-badge priority-${messageData.priority}`;
    }
    if (messageTime) messageTime.textContent = new Date(messageData.timestamp.toDate()).toLocaleTimeString();
    
    // Set up buttons
    if (ackButton) {
        ackButton.style.display = messageData.requireAcknowledgment ? 'block' : 'none';
        ackButton.onclick = () => acknowledgeMessage(messageData.id);
    }
    
    if (dismissButton) {
        dismissButton.onclick = () => dismissMessage(messageData.id);
    }
}

/**
 * Get service icon
 * @param {string} service - Service name
 * @returns {string} Service icon
 */
function getServiceIcon(service) {
    const icons = {
        'Police': '👮',
        'Fire': '🚒',
        'Ambulance': '🚑',
        'Dispatch': '📞',
        'Civilian': '👤',
        'Admin': '🔐'
    };
    return icons[service] || '❓';
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info)
 */
function showNotification(message, type = 'info') {
    // Try to use existing notification system
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }
    
    // Fallback to console if no notification system
    console.log(`${type.toUpperCase()}: ${message}`);
}

// ================================
// MODAL CREATION FUNCTIONS
// ================================

/**
 * Create outgoing message modal if it doesn't exist
 */
function createMessageModal() {
    if (document.getElementById('messageModal')) return;
    
    const modalHTML = `
        <div id="messageModal" class="modal-overlay" style="display: none;">
            <div class="modal-content message-modal">
                <div class="modal-header">
                    <h3>📤 Send Message</h3>
                    <button class="modal-close" onclick="closeMessageModal()">✕</button>
                </div>
                
                <div class="modal-body">
                    <div class="recipient-info">
                        <div class="recipient-avatar">
                            <span id="recipientIcon">👤</span>
                        </div>
                        <div class="recipient-details">
                            <div id="recipientName" class="recipient-name">Select Recipient</div>
                            <div id="recipientService" class="recipient-service">Unknown Service</div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="messagePriority">Priority Level</label>
                        <select id="messagePriority" class="form-control">
                            <option value="info">ℹ️ Info</option>
                            <option value="urgent">⚠️ Urgent</option>
                            <option value="critical">🚨 Critical</option>
                            <option value="emergency">🆘 Emergency</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="messageContent">Message</label>
                        <textarea id="messageContent" class="form-control" rows="4" 
                                placeholder="Enter your message here..." maxlength="500"></textarea>
                        <div class="character-count">
                            <span id="messageCharCount">0</span>/500
                        </div>
                    </div>
                    
                    <div class="message-options">
                        <label class="checkbox-label">
                            <input type="checkbox" id="requireAcknowledgment">
                            <span class="checkmark"></span>
                            Require acknowledgment
                        </label>
                        
                        <label class="checkbox-label">
                            <input type="checkbox" id="persistentMessage">
                            <span class="checkmark"></span>
                            Persistent message
                        </label>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="control-btn" onclick="closeMessageModal()">Cancel</button>
                    <button class="control-btn primary" onclick="sendMessage()">
                        📤 Send Message
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add character counter
    const messageContent = document.getElementById('messageContent');
    const charCount = document.getElementById('messageCharCount');
    
    if (messageContent && charCount) {
        messageContent.addEventListener('input', () => {
            charCount.textContent = messageContent.value.length;
        });
    }
}

/**
 * Create incoming message modal if it doesn't exist
 */
function createIncomingMessageModal() {
    if (document.getElementById('incomingMessageModal')) return;
    
    const modalHTML = `
        <div id="incomingMessageModal" class="modal-overlay incoming-message" style="display: none;">
            <div class="modal-content incoming-message-modal">
                <div class="modal-header">
                    <h3>📬 Incoming Message</h3>
                    <div id="incomingMessagePriority" class="priority-badge">INFO</div>
                </div>
                
                <div class="modal-body">
                    <div id="incomingMessageFrom" class="message-from">From: Unknown</div>
                    <div id="incomingMessageTime" class="message-time">Now</div>
                    <div id="incomingMessageContent" class="message-content">
                        Message content will appear here
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button id="dismissButton" class="control-btn" onclick="dismissMessage()">
                        🗑️ Dismiss
                    </button>
                    <button id="acknowledgeButton" class="control-btn primary" onclick="acknowledgeMessage()" style="display: none;">
                        ✅ Acknowledge
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Mark a specific message as read
 * @param {string} messageId - Message ID to mark as read
 */
export async function markMessageAsRead(messageId) {
    try {
        console.log('📖 Marking message as read:', messageId);
        
        const messageRef = doc(db, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) {
            console.warn('⚠️ Message document does not exist:', messageId);
            return;
        }
        
        await updateDoc(messageRef, {
            read: true,
            readAt: Timestamp.now(),
            readBy: window.messagingConfig?.userId || 'unknown'
        });
        
        console.log('✅ Message marked as read');
        
    } catch (error) {
        console.error('❌ Error marking message as read:', error);
    }
}

/**
 * Mark all messages for current user as read
 */
export async function markAllMessagesAsRead() {
    try {
        console.log('📖 Marking all messages as read...');
        
        const userId = window.messagingConfig?.userId;
        if (!userId) {
            console.warn('⚠️ No user ID available for marking messages as read');
            return;
        }
        
        // Query for all unread messages for this user
        const messagesRef = collection(db, 'messages');
        const userMessagesQuery = query(
            messagesRef,
            where('to', '==', userId),
            where('read', '==', false)
        );
        
        const snapshot = await getDocs(userMessagesQuery);
        const updatePromises = [];
        
        snapshot.forEach((doc) => {
            const updatePromise = updateDoc(doc.ref, {
                read: true,
                readAt: Timestamp.now(),
                readBy: userId
            });
            updatePromises.push(updatePromise);
        });
        
        await Promise.all(updatePromises);
        
        console.log(`✅ Marked ${updatePromises.length} messages as read`);
        
    } catch (error) {
        console.error('❌ Error marking all messages as read:', error);
    }
}

// ================================
// CLEANUP FUNCTIONS
// ================================

/**
 * Clean up messaging system (call on page unload)
 */
export function cleanupMessaging() {
    console.log('🧹 Cleaning up messaging system...');
    
    // Stop all repeating tones
    activeAudioIntervals.clear();
    
    // Clear all active intervals
    if (window.activeIntervals) {
        window.activeIntervals.forEach((interval, messageId) => {
            clearInterval(interval);
            console.log(`🔇 Cleared interval for message ${messageId} during cleanup`);
        });
        window.activeIntervals.clear();
    }
    
    // Unsubscribe from all message listeners
    messageListeners.forEach(unsubscribe => {
        try {
            unsubscribe();
        } catch (error) {
            console.warn('⚠️ Error unsubscribing from message listener:', error);
        }
    });
    messageListeners = [];
    
    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }
    
    console.log('✅ Messaging system cleaned up');
}

// Set up cleanup on page unload
window.addEventListener('beforeunload', cleanupMessaging);

console.log('📨 Messaging system module loaded');
