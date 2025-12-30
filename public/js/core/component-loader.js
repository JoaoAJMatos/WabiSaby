/**
 * Component Loader Utility
 * Loads HTML components dynamically and inserts them into the DOM
 */

class ComponentLoader {
    constructor() {
        this.cache = new Map();
        this.loading = new Set();
    }

    /**
     * Load a component and insert it into the target element
     * @param {string} componentPath - Path to component file (e.g., 'components/navbar.html')
     * @param {string|HTMLElement} target - CSS selector or DOM element to insert into
     * @param {string} position - 'beforebegin', 'afterbegin', 'beforeend', 'afterend' (default: 'beforeend')
     * @returns {Promise<void>}
     */
    async load(componentPath, target, position = 'beforeend') {
        const targetElement = typeof target === 'string' 
            ? document.querySelector(target) 
            : target;

        if (!targetElement) {
            console.error(`ComponentLoader: Target element not found for ${componentPath}`);
            return;
        }

        // Check cache
        if (this.cache.has(componentPath)) {
            this.insertComponent(targetElement, this.cache.get(componentPath), position);
            return;
        }

        // Check if already loading
        if (this.loading.has(componentPath)) {
            // Wait for the ongoing load to complete
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (this.cache.has(componentPath)) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 50);
            });
            this.insertComponent(targetElement, this.cache.get(componentPath), position);
            return;
        }

        // Load component
        this.loading.add(componentPath);
        try {
            // Try multiple possible paths
            const paths = [
                `/components/${componentPath}`,
                `../components/${componentPath}`,
                `./components/${componentPath}`
            ];
            
            let response = null;
            let lastError = null;
            
            for (const path of paths) {
                try {
                    response = await fetch(path);
                    if (response.ok) break;
                } catch (err) {
                    lastError = err;
                    continue;
                }
            }
            
            if (!response || !response.ok) {
                throw new Error(`Failed to load component: ${componentPath} (${response?.status || 'network error'})`);
            }
            
            const html = await response.text();
            this.cache.set(componentPath, html);
            this.insertComponent(targetElement, html, position);
        } catch (error) {
            console.error(`ComponentLoader: Error loading ${componentPath}:`, error);
            // Show error in the component placeholder
            targetElement.innerHTML = `<div style="color: red; padding: 10px;">Error loading component: ${componentPath}</div>`;
        } finally {
            this.loading.delete(componentPath);
        }
    }

    /**
     * Insert component HTML into target element
     * @param {HTMLElement} targetElement - Target DOM element
     * @param {string} html - HTML content to insert
     * @param {string} position - Insert position
     */
    insertComponent(targetElement, html, position) {
        if (position === 'replace') {
            targetElement.innerHTML = html;
        } else {
            targetElement.insertAdjacentHTML(position, html);
        }
    }

    /**
     * Load multiple components
     * @param {Array<{path: string, target: string|HTMLElement, position?: string}>} components
     * @returns {Promise<void>}
     */
    async loadMultiple(components) {
        await Promise.all(
            components.map(comp => 
                this.load(comp.path, comp.target, comp.position || 'beforeend')
            )
        );
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Create global instance
const componentLoader = new ComponentLoader();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentLoader;
}

