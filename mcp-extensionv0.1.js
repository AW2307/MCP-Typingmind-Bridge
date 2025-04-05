// MCP Bridge configuration
const MCP_BRIDGE_URL = 'https://globe-sam-expired-an.trycloudflare.com::JL5e78VuqqN2LNTln4ewOi3DzDWiDp3U';

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

// Main plugin sync function
async function syncMCPPlugins() {
    try {
        const response = await globalThis.fetch(`${MCP_BRIDGE_URL}/mcp/tools`);
        if (!response.ok) {
            throw new Error(`Failed to fetch MCP tools: ${response.statusText}`);
        }
        const mcpToolsData = await response.json();
        await updateMCPPlugins(mcpToolsData);
    } catch (error) {
        displayError(error.message);
    }
}

// Plugin update logic
async function updateMCPPlugins(mcpToolsData) {
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
    const url = '${MCP_BRIDGE_URL}/mcp/tools/${tool.name}/call';
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

    console.log('MCP Extension initializing...');
    syncMCPPlugins().catch(err => {
        displayError(`Initialization failed: ${err.message}`);
    });
