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

// Function to get the MCP bridge URL from storage
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

// Function to save the MCP bridge URL
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

// Main plugin sync function
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

// Plugin update logic
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

// Function to create and insert MCP settings tab
function createMCPSettingsTab() {
    // Find the container element - look for the workspace tabs
    const tabsContainer = document.querySelector('.min-w-max.h-full.w-full.flex.items-center.justify-start.gap-1.md\\:gap-2.md\\:flex-col');
    if (!tabsContainer) {
        console.error('MCP Extension: Could not find workspace tabs container');
        return null;
    }
    
    // Check if the MCP tab already exists
    if (document.querySelector('[data-element-id="workspace-tab-mcp"]')) {
        return document.querySelector('[data-element-id="workspace-tab-mcp"]');
    }
    
    // Create a new tab button similar to the existing ones
    const mcpTab = document.createElement('button');
    mcpTab.setAttribute('data-element-id', 'workspace-tab-mcp');
    mcpTab.className = 'min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full';
    
    // Tab content with icon and label
    mcpTab.innerHTML = `
        <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
            <svg class="w-4 h-4 flex-shrink-0" width="18px" height="18px" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <path d="M6.5,5.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5,.672,1.5,1.5-.672,1.5-1.5,1.5Z" fill="currentColor"></path>
                    <path d="M11.5,15.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5,.672,1.5,1.5-.672,1.5-1.5,1.5Z" fill="currentColor"></path>
                    <path d="M11.5,5.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5,.672,1.5,1.5-.672,1.5-1.5,1.5Z" fill="currentColor"></path>
                    <path d="M6.5,15.5c-.828,0-1.5-.672-1.5-1.5s.672-1.5,1.5-1.5,1.5,.672,1.5,1.5-.672,1.5-1.5,1.5Z" fill="currentColor"></path>
                    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" x1="6.5" x2="11.5" y1="4" y2="4"></line>
                    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" x1="6.5" x2="11.5" y1="14" y2="14"></line>
                    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" x1="5" x2="5" y1="5.5" y2="12.5"></line>
                    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" x1="13" x2="13" y1="5.5" y2="12.5"></line>
                </g>
            </svg>
            <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">MCP</span>
        </span>
    `;
    
    // Find where to insert the tab - before the settings tab
    const settingsTab = document.querySelector('[data-element-id="workspace-tab-settings"]');
    if (settingsTab) {
        tabsContainer.insertBefore(mcpTab, settingsTab);
    } else {
        // If settings tab not found, add to end
        tabsContainer.appendChild(mcpTab);
    }
    
    // Add click handler
    mcpTab.addEventListener('click', () => {
        // Show the MCP settings panel
        showMCPSettingsPanel();
        
        // Make this tab active
        document.querySelectorAll('[data-element-id^="workspace-tab-"]').forEach(tab => {
            const span = tab.querySelector('span');
            if (span) {
                if (tab === mcpTab) {
                    span.classList.remove('text-white/70');
                    span.classList.add('text-white', 'bg-white/20');
                } else {
                    span.classList.remove('text-white', 'bg-white/20');
                    span.classList.add('text-white/70');
                }
            }
        });
    });
    
    return mcpTab;
}

// Function to show the MCP settings panel
function showMCPSettingsPanel() {
    // Clean up any existing panel
    const existingPanel = document.getElementById('mcp-settings-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // Get main content area
    const mainContent = document.querySelector('[data-element-id="chat-space-middle-part"]');
    if (!mainContent) {
        console.error('MCP Extension: Could not find main content area');
        return;
    }
    
    // Store original content
    if (!mainContent._originalContent) {
        mainContent._originalContent = mainContent.innerHTML;
    }
    
    // Clear content area
    mainContent.innerHTML = '';
    
    // Create settings panel
    const panel = document.createElement('div');
    panel.id = 'mcp-settings-panel';
    panel.className = 'flex flex-col w-full max-w-3xl mx-auto p-6';
    
    // Panel content
    panel.innerHTML = `
        <div class="flex items-center justify-between mb-8">
            <h1 class="text-2xl font-bold text-slate-900 dark:text-white">MCP Extension Settings</h1>
            <button id="mcp-back-btn" class="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                Back to Chat
            </button>
        </div>
        
        <div class="space-y-6">
            <div class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Bridge Connection</h2>
                
                <div class="space-y-2">
                    <label for="mcp-bridge-url" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        MCP Bridge URL
                    </label>
                    <input 
                        type="text" 
                        id="mcp-bridge-url" 
                        class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="${DEFAULT_MCP_BRIDGE_URL}"
                    />
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                        Enter the URL of your MCP Bridge server
                    </p>
                </div>
                
                <div class="mt-4 flex justify-end space-x-3">
                    <button id="mcp-test-btn" class="px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                        Test Connection
                    </button>
                    <button id="mcp-save-btn" class="px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
                        Save URL
                    </button>
                </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Plugin Management</h2>
                
                <div class="space-y-2">
                    <p class="text-sm text-slate-700 dark:text-slate-300">
                        Sync MCP tools as plugins in TypingMind
                    </p>
                    <button id="mcp-sync-btn" class="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                        Sync Plugins
                    </button>
                </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">About MCP Extension</h2>
                
                <div class="text-sm text-slate-700 dark:text-slate-300 space-y-2">
                    <p>
                        The MCP (Model Completion Protocol) extension allows you to connect TypingMind to custom tools and plugins through an MCP Bridge server.
                    </p>
                    <p>
                        Visit <a href="https://github.com/ddh/mcp" class="text-blue-500 hover:underline" target="_blank">github.com/ddh/mcp</a> for more information.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    mainContent.appendChild(panel);
    
    // Get the URL from storage and set it
    getMCPBridgeURL().then(url => {
        document.getElementById('mcp-bridge-url').value = url;
    });
    
    // Add event listeners
    document.getElementById('mcp-back-btn').addEventListener('click', () => {
        // Restore original content
        if (mainContent._originalContent) {
            mainContent.innerHTML = mainContent._originalContent;
            delete mainContent._originalContent;
        }
        
        // Highlight the chat tab
        const chatTab = document.querySelector('[data-element-id="workspace-tab-chat"]');
        if (chatTab) {
            chatTab.click();
        }
    });
    
    document.getElementById('mcp-test-btn').addEventListener('click', async () => {
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
    
    document.getElementById('mcp-save-btn').addEventListener('click', async () => {
        const urlInput = document.getElementById('mcp-bridge-url');
        const newUrl = urlInput.value.trim();
        
        if (!newUrl) {
            displayError('URL cannot be empty');
            return;
        }
        
        try {
            await saveMCPBridgeURL(newUrl);
            displayToast('URL saved successfully');
        } catch (error) {
            displayError(`Failed to save URL: ${error.message}`);
        }
    });
    
    document.getElementById('mcp-sync-btn').addEventListener('click', () => {
        syncMCPPlugins().catch(err => {
            displayError(`Sync failed: ${err.message}`);
        });
    });
}

// Initialize the extension
function initMCPExtension() {
    console.log('MCP Extension initializing...');
    
    // Function to check for and add the tab
    const addTabIfNeeded = () => {
        if (!document.querySelector('[data-element-id="workspace-tab-mcp"]')) {
            const tab = createMCPSettingsTab();
            if (tab) {
                console.log('MCP tab created successfully');
            }
        }
    };
    
    // Try to add the tab immediately
    setTimeout(addTabIfNeeded, 1000);
    
    // Then try periodically to ensure it stays after UI updates
    setInterval(addTabIfNeeded, 2000);
    
    // Start syncing plugins
    syncMCPPlugins().catch(err => {
        displayError(`Initialization failed: ${err.message}`);
    });
}

// Start the extension
initMCPExtension();
