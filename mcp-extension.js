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
        const db = await getDB(); return new Promise((resolve, reject) => {
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

// New settings UI
function showSettingsPanel() {
    // Remove any existing panel
    const existingPanel = document.querySelector('[data-mcp-extension-settings]');
    if (existingPanel) existingPanel.remove();
    
    const existingBackdrop = document.querySelector('[data-mcp-extension-backdrop]');
    if (existingBackdrop) existingBackdrop.remove();
    
    // Create settings panel
    const panel = document.createElement('div');
    panel.setAttribute('data-mcp-extension-settings', '');
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 20px;
        z-index: 10000;
        box-shadow: 0 0 10px rgba(0,0,0,0.2);
        width: 400px;
        max-width: 90vw;
    `;
    
    // Create header
    const header = document.createElement('h2');
    header.textContent = 'MCP Extension Settings';
    header.style.cssText = 'margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px;';
    panel.appendChild(header);
    
    // Create URL input
    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'MCP Bridge URL:';
    urlLabel.style.cssText = 'display: block; margin-bottom: 5px; font-weight: bold;';
    panel.appendChild(urlLabel);
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px;';
    panel.appendChild(urlInput);
    
    // Load current URL
    getMCPBridgeURL().then(url => {
        urlInput.value = url;
    });
    
    // Create buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = 'padding: 8px 16px; background: #f2f2f2; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;';
    cancelButton.onclick = () => {
        panel.remove();
        document.querySelector('[data-mcp-extension-backdrop]')?.remove();
    };
    buttonContainer.appendChild(cancelButton);
    
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.style.cssText = 'padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;';
    saveButton.onclick = async () => {
        const newUrl = urlInput.value.trim();
        if (!newUrl) {
            displayError('URL cannot be empty');
            return;
        }
        
        try {
            await saveMCPBridgeURL(newUrl);
            panel.remove();
            document.querySelector('[data-mcp-extension-backdrop]')?.remove();
            displayToast('Settings saved. Resyncing plugins...');
            await syncMCPPlugins();
        } catch (error) {
            displayError(`Failed to save settings: ${error.message}`);
        }
    };
    buttonContainer.appendChild(saveButton);
    
    panel.appendChild(buttonContainer);
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.setAttribute('data-mcp-extension-backdrop', '');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
    `;
    backdrop.onclick = (e) => {
        if (e.target === backdrop) {
            backdrop.remove();
            panel.remove();
        }
    };
    
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
}

// Create settings button
function createSettingsButton() {
    const existingButton = document.querySelector('[data-mcp-extension-settings-button]');
    if (existingButton) existingButton.remove();
    
    const button = document.createElement('button');
    button.setAttribute('data-mcp-extension-settings-button', '');
    button.textContent = '⚙️';
    button.title = 'MCP Extension Settings';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 40px;
        height: 40px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    button.onclick = showSettingsPanel;
    document.body.appendChild(button);
}

// Initialize the extension
function initMCPExtension() {
    console.log('MCP Extension initializing...');
    createSettingsButton();
    syncMCPPlugins().catch(err => {
        displayError(`Initialization failed: ${err.message}`);
    });
}

// Start the extension
initMCPExtension();
