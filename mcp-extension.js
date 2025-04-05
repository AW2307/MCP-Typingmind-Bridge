// MCP Bridge configuration - changed from constant to configurable setting
const MCP_BRIDGE_URL_KEY = 'MCP_BRIDGE_URL';
const DEFAULT_MCP_BRIDGE_URL = 'http://localhost:8000';

// Utility functions for IndexedDB operations
const DB_NAME = 'keyval-store';
const STORE_NAME = 'keyval';
const PLUGINS_KEY = 'TM_useInstalledPlugins';

async function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// New function to get the MCP bridge URL from storage
async function getMCPBridgeURL() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(MCP_BRIDGE_URL_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result || DEFAULT_MCP_BRIDGE_URL);
            };
        });
    } catch (e) {
        console.error('Failed to read MCP Bridge URL:', e);
        return DEFAULT_MCP_BRIDGE_URL;
    }
}

// New function to save the MCP bridge URL
async function saveMCPBridgeURL(url) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(url, MCP_BRIDGE_URL_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (e) {
        console.error('Failed to save MCP Bridge URL:', e);
        throw e;
    }
}

async function getPlugins() {
    try {
        const db = await getDB(); 
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(PLUGINS_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                try {
                    const plugins = request.result || [];
                    resolve(plugins);
                } catch (e) {
                    reject(new Error('Failed to parse plugins: ' + e.message));
                }
            };
        });
    } catch (e) {
        console.error('Failed to read plugins:', e);
        return [];
    }
}

async function savePlugins(plugins) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(plugins, PLUGINS_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (e) {
        console.error('Failed to save plugins:', e);
        throw e;
    }
}

// Notification display functions
function displayToast(message, type = 'info') {
    console.log(`MCP Extension ${type}:`, message);
    
    // Set color based on notification type
    const bgColor = type === 'error' ? 'red' : '#007bff';
    const prefix = type === 'error' ? 'Error' : 'Info';
    
    // Create or update toast element
    const toastContainer = document.querySelector(`[data-mcp-extension-${type}]`) || 
        (() => {
            const div = document.createElement('div');
            div.setAttribute(`data-mcp-extension-${type}`, '');
            div.style.cssText = `position:fixed;bottom:20px;right:20px;background:${bgColor};color:white;padding:10px;border-radius:5px;z-index:9999;`;
            document.body.appendChild(div);
            return div;
        })();
    
    toastContainer.textContent = `MCP Extension ${prefix}: ${message}`;
    setTimeout(() => toastContainer.remove(), 5000);
}

function displayError(message) {
    console.error('MCP Extension Error:', message);
    displayToast(message, 'error');
}

// Modified to use dynamic URL
async function syncMCPPlugins() {
    try {
        const mcpBridgeURL = await getMCPBridgeURL();
        console.log(`MCP Extension: Using bridge URL: ${mcpBridgeURL}`);
        
        const response = await globalThis.fetch(`${mcpBridgeURL}/mcp/tools`);
        if (!response.ok) {
            throw new Error(`Failed to fetch MCP tools: ${response.statusText}`);
        }
        const mcpToolsData = await response.json();
        await updateMCPPlugins(mcpToolsData, mcpBridgeURL);
    } catch (error) {
        displayError(error.message);
    }
}

// Modified to accept URL parameter
async function updateMCPPlugins(mcpToolsData, mcpBridgeURL) {
    try {
        // Get current plugins
        const currentPlugins = await getPlugins();
        const currentMCPPlugins = currentPlugins.filter(p => p.id?.startsWith('mcp_'));
        const nonMCPPlugins = currentPlugins.filter(p => !p.id?.startsWith('mcp_'));

        // Build new MCP plugins
        const newMCPPlugins = [];
        const categories = new Set();
        
        for (const mcpName in mcpToolsData) {
            const { tools } = mcpToolsData[mcpName];
            if (!Array.isArray(tools)) continue;
            
            categories.add(mcpName);

            for (const tool of tools) {
                const pluginId = `mcp_${tool.name}`;
                const existing = currentMCPPlugins.find(p => p.id === pluginId);
                
                const plugin = {
                    uuid: existing?.uuid || crypto.randomUUID(),
                    id: pluginId,
                    emoji: "🔧",
                    title: `MCP - ${tool.name}`,
                    overviewMarkdown: `## ${tool.name}\n\n${tool.description}`,
                    openaiSpec: {
                        name: pluginId,
                        description: tool.description,
                        parameters: tool.inputSchema
                    },
                    implementationType: "javascript",
                    outputType: "respond_to_ai",
                    // Using dynamic URL in generated code
                    code: `async function ${pluginId}(data) {
    const url = '${mcpBridgeURL}/mcp/tools/${tool.name}/call';
    let body = data;
    if (typeof data === 'string') {
        const requiredParams = ${JSON.stringify(tool.inputSchema.required)};
        if (requiredParams.length > 0) {
            body = {
                [requiredParams[0]]: data
            };
        }
    }
    const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('Request failed: ' + response.statusText);
    return await response.json();
}`
                };
                
                newMCPPlugins.push(plugin);
            }
        }

        // Calculate changes
        const added = newMCPPlugins.filter(p => !currentMCPPlugins.some(cp => cp.id === p.id));
        const removed = currentMCPPlugins.filter(p => !newMCPPlugins.some(np => np.id === p.id));
        const unchanged = newMCPPlugins.length - added.length;

        // Merge and save
        const updatedPlugins = [...nonMCPPlugins, ...newMCPPlugins];
        await savePlugins(updatedPlugins);
        
        // Prepare notification message
        let message = '';
        if (added.length > 0) {
            message += `Added ${added.length} plugin${added.length > 1 ? 's' : ''}. `;
        }
        if (removed.length > 0) {
            message += `Removed ${removed.length} plugin${removed.length > 1 ? 's' : ''}. `;
        }
        if (unchanged > 0) {
            message += `${unchanged} plugin${unchanged > 1 ? 's' : ''} unchanged. `;
        }
        message += `Total: ${newMCPPlugins.length} plugins across ${categories.size} categor${categories.size > 1 ? 'ies' : 'y'}.`;
        
        // Show toast notification
        displayToast(message);
        
        console.log('MCP plugins synchronized successfully', {
            total: updatedPlugins.length,
            mcp: newMCPPlugins.length,
            other: nonMCPPlugins.length,
            added: added.length,
            removed: removed.length,
            categories: Array.from(categories)
        });
    } catch (error) {
        displayError(`Failed to update plugins: ${error.message}`);
    }
}

// Create a floating button for MCP settings
function createMCPFloatingButton() {
    // Check if button already exists
    if (document.getElementById('mcp-settings-button')) {
        return;
    }
    
    // Create the button element
    const floatingButton = document.createElement('div');
    floatingButton.id = 'mcp-settings-button';
    floatingButton.className = 'fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 cursor-pointer transform z-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all';
    floatingButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-900 dark:text-white">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <span class="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">M</span>
    `;
    
    // Add tooltip
    floatingButton.title = "MCP Settings";
    
    // Position in the bottom right (with some padding for mobile)
    floatingButton.style.right = '20px';
    floatingButton.style.bottom = '80px';
    
    // Make it draggable
    let isDragging = false;
    let offsetX, offsetY;
    
    floatingButton.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - floatingButton.getBoundingClientRect().left;
        offsetY = e.clientY - floatingButton.getBoundingClientRect().top;
        floatingButton.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        
        // Keep button within viewport bounds
        const maxX = window.innerWidth - floatingButton.offsetWidth;
        const maxY = window.innerHeight - floatingButton.offsetHeight;
        
        floatingButton.style.right = 'auto';
        floatingButton.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        floatingButton.style.bottom = 'auto';
        floatingButton.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            floatingButton.style.cursor = 'pointer';
        }
    });
    
    // Handle click to open settings
    floatingButton.addEventListener('click', () => {
        if (!isDragging) {
            showMCPSettingsModal();
        }
    });
    
    // Append to body
    document.body.appendChild(floatingButton);
    console.log('MCP Settings button added to page');
}

// Create and show the settings modal
async function showMCPSettingsModal() {
    // Check if modal already exists
    const existingModal = document.getElementById('mcp-settings-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create the modal container
    const modal = document.createElement('div');
    modal.id = 'mcp-settings-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
    
    // Get current URL
    const currentUrl = await getMCPBridgeURL();
    
    // Create the modal content
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                    <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    MCP Settings
                </h3>
                <button id="mcp-close-modal" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            <div class="p-4">
                <div class="mb-4">
                    <label for="mcp-bridge-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        MCP Bridge URL
                    </label>
                    <input type="text" id="mcp-bridge-url" 
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="${DEFAULT_MCP_BRIDGE_URL}" 
                        value="${currentUrl}">
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Enter the URL to your MCP Bridge server
                    </p>
                </div>
                
                <div class="mb-4">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Connected Plugins: <span id="mcp-plugin-count">Loading...</span>
                        </span>
                        <button id="mcp-sync-plugins" class="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center">
                            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                            Sync Now
                        </button>
                    </div>
                    <div id="mcp-connection-status" class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Checking connection...
                    </div>
                </div>
                
                <div class="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4 mt-6">
                    <button id="mcp-test-connection" class="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Test Connection
                    </button>
                    <button id="mcp-save-settings" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('mcp-close-modal').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close when clicking outside the modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Test connection button
    document.getElementById('mcp-test-connection').addEventListener('click', async () => {
        const urlInput = document.getElementById('mcp-bridge-url');
        const url = urlInput.value.trim() || DEFAULT_MCP_BRIDGE_URL;
        const statusDiv = document.getElementById('mcp-connection-status');
        
        statusDiv.textContent = 'Testing connection...';
        statusDiv.className = 'mt-2 text-sm text-blue-600 dark:text-blue-400';
        
        try {
            const response = await fetch(`${url}/mcp/tools`);
            if (!response.ok) {
                throw new Error(`Failed to connect: ${response.statusText}`);
            }
            
            const data = await response.json();
            const toolCount = Object.values(data).reduce((count, category) => 
                count + (category.tools?.length || 0), 0);
            
            statusDiv.textContent = `Connection successful! Found ${toolCount} tools.`;
            statusDiv.className = 'mt-2 text-sm text-green-600 dark:text-green-400';
        } catch (error) {
            statusDiv.textContent = `Connection failed: ${error.message}`;
            statusDiv.className = 'mt-2 text-sm text-red-600 dark:text-red-400';
        }
    });
    
    // Save settings button
    document.getElementById('mcp-save-settings').addEventListener('click', async () => {
        const urlInput = document.getElementById('mcp-bridge-url');
        const url = urlInput.value.trim() || DEFAULT_MCP_BRIDGE_URL;
        
        try {
            await saveMCPBridgeURL(url);
            await syncMCPPlugins();
            
            // Show success message
            const statusDiv = document.getElementById('mcp-connection-status');
            statusDiv.textContent = 'Settings saved successfully!';
            statusDiv.className = 'mt-2 text-sm text-green-600 dark:text-green-400';
            
            // Close modal after a short delay
            setTimeout(() => {
                modal.remove();
            }, 1500);
        } catch (error) {
            const statusDiv = document.getElementById('mcp-connection-status');
            statusDiv.textContent = `Error saving settings: ${error.message}`;
            statusDiv.className = 'mt-2 text-sm text-red-600 dark:text-red-400';
        }
    });
    
    // Sync plugins button
    document.getElementById('mcp-sync-plugins').addEventListener('click', async () => {
        const statusDiv = document.getElementById('mcp-connection-status');
        statusDiv.textContent = 'Syncing plugins...';
        statusDiv.className = 'mt-2 text-sm text-blue-600 dark:text-blue-400';
        
        try {
            await syncMCPPlugins();
            
            // Update plugin count
            updatePluginCount();
            
            statusDiv.textContent = 'Plugins synced successfully!';
            statusDiv.className = 'mt-2 text-sm text-green-600 dark:text-green-400';
        } catch (error) {
            statusDiv.textContent = `Sync failed: ${error.message}`;
            statusDiv.className = 'mt-2 text-sm text-red-600 dark:text-red-400';
        }
    });
    
    // Update plugin count on load
    updatePluginCount();
    
    // Check connection status
    checkConnectionStatus();
}

// Helper function to update plugin count in the modal
async function updatePluginCount() {
    const countElement = document.getElementById('mcp-plugin-count');
    if (!countElement) return;
    
    try {
        const plugins = await getPlugins();
        const mcpPlugins = plugins.filter(p => p.id?.startsWith('mcp_'));
        countElement.textContent = `${mcpPlugins.length} plugins`;
    } catch (error) {
        countElement.textContent = 'Error loading plugins';
    }
}

// Helper function to check connection status
async function checkConnectionStatus() {
    const statusDiv = document.getElementById('mcp-connection-status');
    if (!statusDiv) return;
    
    try {
        const url = await getMCPBridgeURL();
        const response = await fetch(`${url}/mcp/tools`);
        
        if (!response.ok) {
            throw new Error(`Connection error: ${response.statusText}`);
        }
        
        const data = await response.json();
        const toolCount = Object.values(data).reduce((count, category) => 
            count + (category.tools?.length || 0), 0);
        
        statusDiv.textContent = `Connected to MCP Bridge. ${toolCount} tools available.`;
        statusDiv.className = 'mt-2 text-sm text-green-600 dark:text-green-400';
    } catch (error) {
        statusDiv.textContent = `Not connected: ${error.message}`;
        statusDiv.className = 'mt-2 text-sm text-red-600 dark:text-red-400';
    }
}

// Add keyboard shortcut to open settings (Ctrl+Shift+M)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        showMCPSettingsModal();
    }
});

// Initialize by creating the button and syncing plugins
function initMCPExtension() {
    console.log('MCP Extension initializing...');
    
    // Try to add the floating button immediately
    createMCPFloatingButton();
    
    // Then check periodically to ensure it exists (in case of dynamic UI changes)
    const buttonCheckInterval = setInterval(() => {
        if (!document.getElementById('mcp-settings-button')) {
            createMCPFloatingButton();
        }
    }, 5000);
    
    // Start syncing plugins
    syncMCPPlugins().catch(err => {
        displayError(`Initialization failed: ${err.message}`);
    });
    
    // Add some additional CSS for the button
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        #mcp-settings-button {
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        #mcp-settings-button:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
        }
        #mcp-settings-button:active {
            transform: scale(0.95);
        }
        #mcp-settings-modal {
            backdrop-filter: blur(2px);
        }
    `;
    document.head.appendChild(styleElement);
}

// Start the extension
initMCPExtension();
