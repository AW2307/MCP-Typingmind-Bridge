// MCP Bridge configuration
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

// Show MCP settings panel
function showMCPSettingsPanel() {
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'mcp-settings-panel';
    settingsPanel.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
    
    settingsPanel.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-900 dark:text-white">MCP Extension Settings</h2>
                <button id="mcp-close-settings" class="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-white">
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            
            <div class="space-y-4">
                <div>
                    <label for="mcp-bridge-url" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">MCP Bridge URL</label>
                    <input 
                        type="text" 
                        id="mcp-bridge-url" 
                        class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        placeholder="${DEFAULT_MCP_BRIDGE_URL}"
                    >
                </div>
                
                <div class="flex gap-2">
                    <button id="mcp-test-connection" class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        Test Connection
                    </button>
                    <button id="mcp-save-url" class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
                        Save
                    </button>
                </div>
                
                <div class="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                    <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-2">Plugin Management</h3>
                    <button id="mcp-sync-plugins" class="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                        Sync MCP Plugins
                    </button>
                </div>
                
                <div class="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                    <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-2">About</h3>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        MCP Extension connects TypingMind to your local MCP Bridge server, enabling access to your custom tools and plugins.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(settingsPanel);
    
    // Load current URL
    getMCPBridgeURL().then(url => {
        const input = document.getElementById('mcp-bridge-url');
        if (input) input.value = url;
    });
    
    // Add event listeners
    document.getElementById('mcp-close-settings').addEventListener('click', () => {
        settingsPanel.remove();
    });
    
    document.getElementById('mcp-test-connection').addEventListener('click', async () => {
        const urlInput = document.getElementById('mcp-bridge-url');
        const url = urlInput.value.trim();
        
        if (!url) {
            displayError('URL cannot be empty');
            return;
        }
        
        try {
            const response = await fetch(`${url}/mcp/tools`);
            if (!response.ok) {
                throw new Error(`Failed to connect: ${response.statusText}`);
            }
            displayToast('Connection successful!');
        } catch (error) {
            displayError(`Connection failed: ${error.message}`);
        }
    });
    
    document.getElementById('mcp-save-url').addEventListener('click', async () => {
        const urlInput = document.getElementById('mcp-bridge-url');
        const url = urlInput.value.trim();
        
        if (!url) {
            displayError('URL cannot be empty');
            return;
        }
        
        try {
            await saveMCPBridgeURL(url);
            displayToast('URL saved successfully');
        } catch (error) {
            displayError(`Failed to save URL: ${error.message}`);
        }
    });
    
    document.getElementById('mcp-sync-plugins').addEventListener('click', () => {
        syncMCPPlugins();
    });
}

// Add the settings button to the workspace tabs
function addSettingsButtonToWorkspace() {
    // We'll insert MCP settings directly into the settings menu
    
    // First, find all the tabs in the workspace
    const tabs = document.querySelectorAll('button[data-element-id^="workspace-tab-"]');
    
    // Find the settings tab specifically
    const settingsTab = Array.from(tabs).find(tab => 
        tab.getAttribute('data-element-id') === 'workspace-tab-settings'
    );
    
    // If no settings tab, we can't add our entry
    if (!settingsTab) {
        console.error('MCP Extension: Settings tab not found');
        return false;
    }
    
    // Let's try something different - add a new button directly after the Settings tab
    const mcpButton = document.createElement('button');
    mcpButton.setAttribute('data-element-id', 'workspace-tab-mcp');
    mcpButton.className = settingsTab.className;
    mcpButton.innerHTML = `
        <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
            <svg class="w-4 h-4 flex-shrink-0" width="18px" height="18px" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <path d="M6,9.00002C6,10.65,7.35,12,9,12C10.65,12,12,10.65,12,9.00002C12,7.35002,10.65,6.00002,9,6.00002C7.35,6.00002,6,7.35002,6,9.00002ZM7.5,9.00002C7.5,8.17002,8.17,7.50002,9,7.50002C9.83,7.50002,10.5,8.17002,10.5,9.00002C10.5,9.83002,9.83,10.5,9,10.5C8.17,10.5,7.5,9.83002,7.5,9.00002Z" fill="currentColor"/>
                    <path d="M8.65002,17H9.36002L9.37002,16.99C10.27,16.99,11.01,16.32,11.11,15.43L11.18,14.78L11.57,14.62L12.08,15.03C12.78,15.59,13.78,15.53,14.41,14.9L14.91,14.4C15.54,13.77,15.6,12.77,15.04,12.07L14.63,11.56L14.79,11.16L15.44,11.09C16.33,10.99,17,10.24,17,9.35001V8.64001C17,7.75001,16.33,7.00001,15.44,6.90001L14.79,6.83001L14.63,6.44001L15.04,5.93001C15.6,5.23001,15.54,4.23001,14.91,3.60001L14.41,3.10001C13.78,2.47001,12.78,2.41001,12.08,2.97001L11.57,3.38001L11.18,3.22001L11.11,2.57001C11.01,1.68001,10.26,1.01001,9.37002,1.01001H8.66002C7.77002,1.01001,7.02002,1.68001,6.92002,2.57001L6.85002,3.22001L6.45002,3.38001L5.94002,2.97001C5.24002,2.41001,4.24002,2.47001,3.61002,3.10001L3.11002,3.60001C2.48002,4.23001,2.42002,5.23001,2.98002,5.93001L3.39002,6.44001L3.23002,6.84001L2.58002,6.91001C1.69002,7.01001,1.02002,7.76001,1.02002,8.65001V9.36001C1.02002,10.26,1.69002,11,2.58002,11.1L3.23002,11.17L3.39002,11.57L2.98002,12.08C2.42002,12.78,2.48002,13.78,3.11002,14.41L3.61002,14.91C4.24002,15.54,5.24002,15.6,5.94002,15.04L6.45002,14.63L6.84002,14.79L6.91002,15.44C7.01002,16.33,7.76002,17,8.65002,17ZM6.61002,13.08C6.51002,13.04,6.42002,13.02,6.32002,13.02V13.01C6.15002,13.01,5.99002,13.07,5.85002,13.18L4.99002,13.87C4.89002,13.95,4.75002,13.94,4.66002,13.85L4.16002,13.35C4.07002,13.26,4.06002,13.12,4.14002,13.02L4.83002,12.16C5.00002,11.94,5.04002,11.65,4.94002,11.4L4.44002,10.19C4.34002,9.94001,4.10002,9.76001,3.83002,9.73001L2.74002,9.61001C2.62002,9.59001,2.52002,9.49001,2.52002,9.36001V8.65001C2.52002,8.52001,2.61002,8.41001,2.74002,8.40001L3.83002,8.28001C4.10002,8.25001,4.34002,8.07001,4.44002,7.82001L4.94002,6.61001C5.04002,6.35001,5.00002,6.06001,4.83002,5.85001L4.14002,4.99001C4.06002,4.89001,4.07002,4.75001,4.16002,4.66001L4.66002,4.16001C4.75002,4.07001,4.89002,4.06001,4.99002,4.14001L5.85002,4.83001C6.07002,5.00001,6.36002,5.05001,6.61002,4.94001L7.82002,4.44001C8.07002,4.34001,8.25002,4.10001,8.28002,3.83001L8.40002,2.74001C8.42002,2.62001,8.52002,2.52001,8.65002,2.52001H9.36002C9.49002,2.52001,9.60002,2.61001,9.61002,2.74001L9.73002,3.83001C9.76002,4.10001,9.94002,4.34001,10.19,4.44001L11.4,4.94001C11.66,5.04001,11.95,5.00001,12.16,4.83001L13.02,4.14001C13.12,4.06001,13.26,4.07001,13.35,4.16001L13.85,4.66001C13.94,4.75001,13.95,4.89001,13.87,4.99001L13.18,5.85001C13.01,6.07001,12.97,6.36001,13.07,6.61001L13.57,7.82001C13.68,8.07001,13.91,8.25001,14.18,8.28001L15.27,8.40001C15.39,8.42001,15.49,8.52001,15.49,8.65001V9.39001C15.48,9.50001,15.39,9.60001,15.27,9.61001L14.18,9.73001C13.91,9.76001,13.68,9.94001,13.57,10.19L13.07,11.4C12.97,11.66,13.01,11.95,13.18,12.16L13.87,13.02C13.95,13.12,13.94,13.26,13.85,13.35L13.35,13.85C13.26,13.94,13.12,13.95,13.02,13.87L12.16,13.18C11.94,13.01,11.65,12.97,11.4,13.07L10.19,13.57C9.94002,13.68,9.76002,13.91,9.73002,14.18L9.61002,15.28C9.59002,15.4,9.49002,15.5,9.36002,15.5H8.65002C8.52002,15.5,8.41002,15.41,8.40002,15.28L8.28002,14.19C8.25002,13.92,8.07002,13.69,7.82002,13.58L6.61002,13.08Z" fill="currentColor"/>
                </g>
            </svg>
            <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">MCP</span>
        </span>
    `;
    
    // Add click event to the button
    mcpButton.addEventListener('click', showMCPSettingsPanel);
    
    // Insert the button after the settings tab
    const parentElement = settingsTab.parentElement;
    if (!parentElement) {
        console.error('MCP Extension: Parent element not found');
        return false;
    }
    
    // Insert before the Settings button
    parentElement.insertBefore(mcpButton, settingsTab);
    
    console.log('MCP Extension: Settings button added successfully');
    return true;
}

// Add settings button to the bottom panel (alternative approach)
function addSettingsButtonToBottomPanel() {
    // Find the cloud sync button as a reference point
    const cloudSyncButton = document.querySelector('[data-element-id="cloud-sync-button"]');
    if (!cloudSyncButton) {
        console.error('MCP Extension: Cloud sync button not found');
        return false;
    }
    
    // Create a new button similar to cloud sync button
    const mcpButton = document.createElement('button');
    mcpButton.setAttribute('data-element-id', 'mcp-settings-button');
    mcpButton.className = cloudSyncButton.className;
    mcpButton.innerHTML = `
        <span class="block group-hover:bg-white/30 w-[35px] h-[35px] transition-all rounded-lg flex items-center justify-center group-hover:text-white/90">
            <svg class="w-6 h-6 flex-shrink-0" width="24px" height="24px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <path d="M6,9.00002C6,10.65,7.35,12,9,12C10.65,12,12,10.65,12,9.00002C12,7.35002,10.65,6.00002,9,6.00002C7.35,6.00002,6,7.35002,6,9.00002ZM7.5,9.00002C7.5,8.17002,8.17,7.50002,9,7.50002C9.83,7.50002,10.5,8.17002,10.5,9.00002C10.5,9.83002,9.83,10.5,9,10.5C8.17,10.5,7.5,9.83002,7.5,9.00002Z" fill="currentColor"/>
                    <path d="M8.65002,17H9.36002L9.37002,16.99C10.27,16.99,11.01,16.32,11.11,15.43L11.18,14.78L11.57,14.62L12.08,15.03C12.78,15.59,13.78,15.53,14.41,14.9L14.91,14.4C15.54,13.77,15.6,12.77,15.04,12.07L14.63,11.56L14.79,11.16L15.44,11.09C16.33,10.99,17,10.24,17,9.35001V8.64001C17,7.75001,16.33,7.00001,15.44,6.90001L14.79,6.83001L14.63,6.44001L15.04,5.93001C15.6,5.23001,15.54,4.23001,14.91,3.60001L14.41,3.10001C13.78,2.47001,12.78,2.41001,12.08,2.97001L11.57,3.38001L11.18,3.22001L11.11,2.57001C11.01,1.68001,10.26,1.01001,9.37002,1.01001H8.66002C7.77002,1.01001,7.02002,1.68001,6.92002,2.57001L6.85002,3.22001L6.45002,3.38001L5.94002,2.97001C5.24002,2.41001,4.24002,2.47001,3.61002,3.10001L3.11002,3.60001C2.48002,4.23001,2.42002,5.23001,2.98002,5.93001L3.39002,6.44001L3.23002,6.84001L2.58002,6.91001C1.69002,7.01001,1.02002,7.76001,1.02002,8.65001V9.36001C1.02002,10.26,1.69002,11,2.58002,11.1L3.23002,11.17L3.39002,11.57L2.98002,12.08C2.42002,12.78,2.48002,13.78,3.11002,14.41L3.61002,14.91C4.24002,15.54,5.24002,15.6,5.94002,15.04L6.45002,14.63L6.84002,14.79L6.91002,15.44C7.01002,16.33,7.76002,17,8.65002,17ZM6.61002,13.08C6.51002,13.04,6.42002,13.02,6.32002,13.02V13.01C6.15002,13.01,5.99002,13.07,5.85002,13.18L4.99002,13.87C4.89002,13.95,4.75002,13.94,4.66002,13.85L4.16002,13.35C4.07002,13.26,4.06002,13.12,4.14002,13.02L4.83002,12.16C5.00002,11.94,5.04002,11.65,4.94002,11.4L4.44002,10.19C4.34002,9.94001,4.10002,9.76001,3.83002,9.73001L2.74002,9.61001C2.62002,9.59001,2.52002,9.49001,2.52002,9.36001V8.65001C2.52002,8.52001,2.61002,8.41001,2.74002,8.40001L3.83002,8.28001C4.10002,8.25001,4.34002,8.07001,4.44002,7.82001L4.94002,6.61001C5.04002,6.35001,5.00002,6.06001,4.83002,5.85001L4.14002,4.99001C4.06002,4.89001,4.07002,4.75001,4.16002,4.66001L4.66002,4.16001C4.75002,4.07001,4.89002,4.06001,4.99002,4.14001L5.85002,4.83001C6.07002,5.00001,6.36002,5.05001,6.61002,4.94001L7.82002,4.44001C8.07002,4.34001,8.25002,4.10001,8.28002,3.83001L8.40002,2.74001C8.42002,2.62001,8.52002,2.52001,8.65002,2.52001H9.36002C9.49002,2.52001,9.60002,2.61001,9.61002,2.74001L9.73002,3.83001C9.76002,4.10001,9.94002,4.34001,10.19,4.44001L11.4,4.94001C11.66,5.04001,11.95,5.00001,12.16,4.83001L13.02,4.14001C13.12,4.06001,13.26,4.07001,13.35,4.16001L13.85,4.66001C13.94,4.75001,13.95,4.89001,13.87,4.99001L13.18,5.85001C13.01,6.07001,12.97,6.36001,13.07,6.61001L13.57,7.82001C13.68,8.07001,13.91,8.25001,14.18,8.28001L15.27,8.40001C15.39,8.42001,15.49,8.52001,15.49,8.65001V9.39001C15.48,9.50001,15.39,9.60001,15.27,9.61001L14.18,9.73001C13.91,9.76001,13.68,9.94001,13.57,10.19L13.07,11.4C12.97,11.66,13.01,11.95,13.18,12.16L13.87,13.02C13.95,13.12,13.94,13.26,13.85,13.35L13.35,13.85C13.26,13.94,13.12,13.95,13.02,13.87L12.16,13.18C11.94,13.01,11.65,12.97,11.4,13.07L10.19,13.57C9.94002,13.68,9.76002,13.91,9.73002,14.18L9.61002,15.28C9.59002,15.4,9.49002,15.5,9.36002,15.5H8.65002C8.52002,15.5,8.41002,15.41,8.40002,15.28L8.28002,14.19C8.25002,13.92,8.07002,13.69,7.82002,13.58L6.61002,13.08Z" fill="currentColor"/>
                </g>
            </svg>
        </span>
        <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">MCP</span>
    `;
    
    // Add click event to the button
    mcpButton.addEventListener('click', showMCPSettingsPanel);
    
    // Insert after cloud sync button
    cloudSyncButton.parentNode.insertBefore(mcpButton, cloudSyncButton.nextSibling);
    
    console.log('MCP Extension: Settings button added to bottom panel');
    return true;
}

// Initialize the extension - try multiple approaches to ensure the button appears
function initMCPExtension() {
    console.log('MCP Extension initializing...');
    
    // Try to add MCP settings in different ways to increase chances of success
    const attemptAddButtons = () => {
        // Try workspace tabs first
        if (document.querySelector('[data-element-id="workspace-tab-mcp"]')) {
            return; // Already added
        }
        
        // Try different approaches
        const added = addSettingsButtonToWorkspace() || addSettingsButtonToBottomPanel();
        
        if (!added) {
            console.log('MCP Extension: Could not add settings button, will retry');
        }
    };
    
    // Initial attempt
    setTimeout(attemptAddButtons, 2000);
    
    // Retry periodically
    setInterval(attemptAddButtons, 5000);
    
    // Start syncing plugins
    syncMCPPlugins().catch(err => {
        displayError(`Initialization failed: ${err.message}`);
    });
}

// Start the extension
initMCPExtension();
