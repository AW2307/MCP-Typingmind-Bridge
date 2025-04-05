// Immediately create a floating button with guaranteed visibility
(function() {
    console.log('MCP Extension: Creating floating button...');
    
    // Add necessary styles
    const style = document.createElement('style');
    style.textContent = `
        #mcp-floating-button {
            position: fixed !important;
            bottom: 80px !important;
            right: 20px !important;
            width: 50px !important;
            height: 50px !important;
            background-color: #007bff !important;
            color: white !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 18px !important;
            font-weight: bold !important;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
            cursor: pointer !important;
            z-index: 999999 !important;
            user-select: none !important;
            border: 2px solid white !important;
        }
        #mcp-settings-modal {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: rgba(0, 0, 0, 0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 9999999 !important;
            font-family: Arial, sans-serif !important;
        }
        .mcp-modal-content {
            background-color: white !important;
            color: black !important;
            border-radius: 8px !important;
            padding: 20px !important;
            width: 90% !important;
            max-width: 500px !important;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3) !important;
        }
        .mcp-modal-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 15px !important;
            padding-bottom: 10px !important;
            border-bottom: 1px solid #eee !important;
        }
        .mcp-modal-title {
            font-size: 18px !important;
            font-weight: bold !important;
            margin: 0 !important;
        }
        .mcp-modal-close {
            background: none !important;
            border: none !important;
            font-size: 24px !important;
            cursor: pointer !important;
            color: #666 !important;
        }
        .mcp-input-group {
            margin-bottom: 15px !important;
        }
        .mcp-label {
            display: block !important;
            margin-bottom: 5px !important;
            font-weight: bold !important;
        }
        .mcp-input {
            width: 100% !important;
            padding: 8px !important;
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            box-sizing: border-box !important;
        }
        .mcp-button-group {
            display: flex !important;
            justify-content: space-between !important;
            margin-top: 20px !important;
        }
        .mcp-button {
            padding: 8px 16px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-weight: bold !important;
            border: none !important;
        }
        .mcp-primary-button {
            background-color: #007bff !important;
            color: white !important;
        }
        .mcp-secondary-button {
            background-color: #6c757d !important;
            color: white !important;
        }
        .mcp-status {
            margin-top: 10px !important;
            padding: 8px !important;
            border-radius: 4px !important;
            text-align: center !important;
        }
        .mcp-status-success {
            background-color: #d4edda !important;
            color: #155724 !important;
        }
        .mcp-status-error {
            background-color: #f8d7da !important;
            color: #721c24 !important;
        }
        @media (prefers-color-scheme: dark) {
            .mcp-modal-content {
                background-color: #333 !important;
                color: #fff !important;
            }
            .mcp-modal-header {
                border-bottom-color: #555 !important;
            }
            .mcp-input {
                background-color: #444 !important;
                color: #fff !important;
                border-color: #666 !important;
            }
            .mcp-modal-close {
                color: #ccc !important;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Create the floating button
    const button = document.createElement('div');
    button.id = 'mcp-floating-button';
    button.textContent = 'MCP';
    document.body.appendChild(button);
    
    console.log('MCP Extension: Button created, attaching event listener');
    
    // MCP Bridge URL key and default
    const MCP_BRIDGE_URL_KEY = 'MCP_BRIDGE_URL';
    const DEFAULT_MCP_BRIDGE_URL = 'http://localhost:8000';
    
    // Get the stored MCP Bridge URL
    async function getMCPBridgeURL() {
        try {
            const request = indexedDB.open("keyval-store");
            return new Promise((resolve, reject) => {
                request.onerror = () => {
                    console.error('Failed to open IndexedDB');
                    resolve(DEFAULT_MCP_BRIDGE_URL);
                };
                
                request.onsuccess = function(event) {
                    const db = event.target.result;
                    const transaction = db.transaction(["keyval"], "readonly");
                    const store = transaction.objectStore("keyval");
                    const getRequest = store.get(MCP_BRIDGE_URL_KEY);
                    
                    getRequest.onerror = () => {
                        console.error('Error reading MCP Bridge URL from IndexedDB');
                        resolve(DEFAULT_MCP_BRIDGE_URL);
                    };
                    
                    getRequest.onsuccess = () => {
                        resolve(getRequest.result || DEFAULT_MCP_BRIDGE_URL);
                    };
                };
            });
        } catch (error) {
            console.error('Error getting MCP Bridge URL:', error);
            return DEFAULT_MCP_BRIDGE_URL;
        }
    }
    
    // Save the MCP Bridge URL
    async function saveMCPBridgeURL(url) {
        try {
            const request = indexedDB.open("keyval-store");
            return new Promise((resolve, reject) => {
                request.onerror = () => {
                    console.error('Failed to open IndexedDB');
                    reject(new Error('Failed to open IndexedDB'));
                };
                
                request.onsuccess = function(event) {
                    const db = event.target.result;
                    const transaction = db.transaction(["keyval"], "readwrite");
                    const store = transaction.objectStore("keyval");
                    const putRequest = store.put(url, MCP_BRIDGE_URL_KEY);
                    
                    putRequest.onerror = () => {
                        console.error('Error saving MCP Bridge URL to IndexedDB');
                        reject(new Error('Error saving MCP Bridge URL'));
                    };
                    
                    putRequest.onsuccess = () => {
                        resolve();
                    };
                };
            });
        } catch (error) {
            console.error('Error saving MCP Bridge URL:', error);
            throw error;
        }
    }
    
    // Sync MCP plugins
    async function syncMCPPlugins(url) {
        const statusElement = document.getElementById('mcp-status');
        if (statusElement) {
            statusElement.textContent = 'Syncing plugins...';
            statusElement.className = 'mcp-status';
        }
        
        try {
            console.log(`MCP Extension: Fetching plugins from ${url}`);
            const response = await fetch(`${url}/mcp/tools`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch MCP tools: ${response.statusText}`);
            }
            
            const data = await response.json();
            const toolCount = Object.values(data).reduce((count, category) => 
                count + (category.tools?.length || 0), 0);
                
            console.log(`MCP Extension: Found ${toolCount} tools`);
            
            if (statusElement) {
                statusElement.textContent = `Sync successful! Found ${toolCount} tools.`;
                statusElement.className = 'mcp-status mcp-status-success';
            }
            
            return true;
        } catch (error) {
            console.error('MCP Extension: Sync failed:', error);
            
            if (statusElement) {
                statusElement.textContent = `Sync failed: ${error.message}`;
                statusElement.className = 'mcp-status mcp-status-error';
            }
            
            return false;
        }
    }
    
    // Create and show the settings modal
    async function showSettingsModal() {
        console.log('MCP Extension: Opening settings modal');
        
        // Remove any existing modal
        const existingModal = document.getElementById('mcp-settings-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Get current URL
        const currentUrl = await getMCPBridgeURL();
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'mcp-settings-modal';
        
        modal.innerHTML = `
            <div class="mcp-modal-content">
                <div class="mcp-modal-header">
                    <h2 class="mcp-modal-title">MCP Extension Settings</h2>
                    <button class="mcp-modal-close" id="mcp-close-modal">&times;</button>
                </div>
                
                <div class="mcp-input-group">
                    <label class="mcp-label" for="mcp-url-input">MCP Bridge URL</label>
                    <input class="mcp-input" id="mcp-url-input" type="text" value="${currentUrl}" placeholder="${DEFAULT_MCP_BRIDGE_URL}">
                    <small style="color: #666 !important; display: block !important; margin-top: 4px !important;">URL to your local MCP Bridge server</small>
                </div>
                
                <div id="mcp-status" class="mcp-status"></div>
                
                <div class="mcp-button-group">
                    <button id="mcp-test-connection" class="mcp-button mcp-secondary-button">Test Connection</button>
                    <button id="mcp-save-settings" class="mcp-button mcp-primary-button">Save & Sync</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('mcp-close-modal').addEventListener('click', () => {
            modal.remove();
        });
        
        document.getElementById('mcp-test-connection').addEventListener('click', async () => {
            const urlInput = document.getElementById('mcp-url-input');
            const url = urlInput.value.trim() || DEFAULT_MCP_BRIDGE_URL;
            const statusElement = document.getElementById('mcp-status');
            
            statusElement.textContent = 'Testing connection...';
            statusElement.className = 'mcp-status';
            
            try {
                const response = await fetch(`${url}/mcp/tools`);
                if (!response.ok) {
                    throw new Error(`Failed to connect: ${response.statusText}`);
                }
                
                const data = await response.json();
                const toolCount = Object.values(data).reduce((count, category) => 
                    count + (category.tools?.length || 0), 0);
                
                statusElement.textContent = `Connection successful! Found ${toolCount} tools.`;
                statusElement.className = 'mcp-status mcp-status-success';
            } catch (error) {
                statusElement.textContent = `Connection failed: ${error.message}`;
                statusElement.className = 'mcp-status mcp-status-error';
            }
        });
        
        document.getElementById('mcp-save-settings').addEventListener('click', async () => {
            const urlInput = document.getElementById('mcp-url-input');
            const url = urlInput.value.trim() || DEFAULT_MCP_BRIDGE_URL;
            const statusElement = document.getElementById('mcp-status');
            
            try {
                await saveMCPBridgeURL(url);
                statusElement.textContent = 'Settings saved. Syncing plugins...';
                statusElement.className = 'mcp-status';
                
                const syncResult = await syncMCPPlugins(url);
                if (syncResult) {
                    setTimeout(() => {
                        modal.remove();
                    }, 1500);
                }
            } catch (error) {
                statusElement.textContent = `Error saving settings: ${error.message}`;
                statusElement.className = 'mcp-status mcp-status-error';
            }
        });
        
        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    // Add click event to button
    button.addEventListener('click', showSettingsModal);
    
    // Add keyboard shortcut (Ctrl+Shift+M)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            showSettingsModal();
        }
    });
    
    // Make button draggable
    let isDragging = false;
    let offsetX, offsetY;
    
    button.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - button.getBoundingClientRect().left;
        offsetY = e.clientY - button.getBoundingClientRect().top;
        button.style.transition = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        
        // Ensure button stays within viewport
        const maxX = window.innerWidth - button.offsetWidth;
        const maxY = window.innerHeight - button.offsetHeight;
        
        button.style.right = 'auto';
        button.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        button.style.bottom = 'auto';
        button.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            button.style.transition = 'all 0.3s ease';
        }
    });
    
    // Periodically check if button exists and re-add if needed
    setInterval(() => {
        if (!document.getElementById('mcp-floating-button')) {
            console.log('MCP Extension: Button missing, re-adding');
            document.body.appendChild(button);
        }
    }, 3000);
    
    console.log('MCP Extension: Initialization complete');
})();
