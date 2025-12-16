/**
 * Common Test Mocks
 * Provides reusable mocks for common dependencies
 */

/**
 * Mock logger that captures logs but doesn't output
 */
const mockLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => mockLogger
};

/**
 * Mock file system operations
 */
function createMockFs() {
    const files = new Map();
    const dirs = new Set();

    return {
        existsSync: (path) => files.has(path) || dirs.has(path),
        readFileSync: (path, encoding) => {
            if (!files.has(path)) {
                throw new Error(`ENOENT: no such file or directory, open '${path}'`);
            }
            return files.get(path);
        },
        writeFileSync: (path, data) => {
            files.set(path, data);
        },
        mkdirSync: (path, options) => {
            dirs.add(path);
        },
        unlinkSync: (path) => {
            files.delete(path);
        },
        rmdirSync: (path) => {
            dirs.delete(path);
        },
        // Helper methods for test setup
        _setFile: (path, content) => {
            files.set(path, content);
        },
        _setDir: (path) => {
            dirs.add(path);
        },
        _clear: () => {
            files.clear();
            dirs.clear();
        },
        _getFiles: () => Array.from(files.keys()),
        _getDirs: () => Array.from(dirs)
    };
}

/**
 * Mock child process spawn
 */
function createMockSpawn() {
    const processes = [];

    const mockSpawn = (command, args, options) => {
        const process = {
            pid: Math.floor(Math.random() * 10000),
            killed: false,
            stdout: {
                on: () => {},
                once: () => {},
                removeListener: () => {}
            },
            stderr: {
                on: () => {},
                once: () => {},
                removeListener: () => {}
            },
            on: (event, handler) => {
                if (event === 'close') {
                    process._closeHandler = handler;
                } else if (event === 'error') {
                    process._errorHandler = handler;
                }
            },
            kill: (signal) => {
                process.killed = true;
                if (process._closeHandler) {
                    setTimeout(() => process._closeHandler(0), 10);
                }
            },
            _emitClose: (code) => {
                if (process._closeHandler) {
                    process._closeHandler(code);
                }
            },
            _emitError: (error) => {
                if (process._errorHandler) {
                    process._errorHandler(error);
                }
            },
            command,
            args,
            options
        };
        processes.push(process);
        return process;
    };

    mockSpawn._getProcesses = () => processes;
    mockSpawn._clear = () => processes.length = 0;

    return mockSpawn;
}

/**
 * Mock execSync
 */
function createMockExecSync() {
    const commands = [];

    const mockExecSync = (command, options) => {
        commands.push({ command, options });
        
        // Simulate 'which' command
        if (command.includes('which')) {
            const cmd = command.replace('which ', '').trim();
            // Return empty string to simulate command not found
            // Tests can override this behavior
            return '';
        }
        
        return '';
    };

    mockExecSync._getCommands = () => commands;
    mockExecSync._clear = () => commands.length = 0;
    mockExecSync._setWhichResult = (command, exists) => {
        // This would need to be implemented based on test needs
    };

    return mockExecSync;
}

/**
 * Mock net socket for IPC
 */
function createMockNetSocket() {
    let connected = false;
    let dataHandlers = [];
    let errorHandlers = [];
    let closeHandlers = [];

    const socket = {
        destroyed: false,
        write: (data) => {
            if (!connected) {
                throw new Error('Socket not connected');
            }
            // Simulate response
            if (dataHandlers.length > 0) {
                // Parse command and respond
                try {
                    const message = JSON.parse(data.toString().trim());
                    if (message.request_id) {
                        // Simulate MPV response
                        const response = JSON.stringify({
                            request_id: message.request_id,
                            error: 'success',
                            data: null
                        }) + '\n';
                        setTimeout(() => {
                            dataHandlers.forEach(handler => handler(Buffer.from(response)));
                        }, 10);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        },
        on: (event, handler) => {
            if (event === 'data') {
                dataHandlers.push(handler);
            } else if (event === 'error') {
                errorHandlers.push(handler);
            } else if (event === 'connect') {
                // Auto-connect
                setTimeout(() => {
                    connected = true;
                    handler();
                }, 10);
            } else if (event === 'close') {
                closeHandlers.push(handler);
            }
        },
        once: (event, handler) => {
            socket.on(event, handler);
        },
        removeListener: (event, handler) => {
            if (event === 'data') {
                dataHandlers = dataHandlers.filter(h => h !== handler);
            } else if (event === 'error') {
                errorHandlers = errorHandlers.filter(h => h !== handler);
            }
        },
        destroy: () => {
            socket.destroyed = true;
            connected = false;
            closeHandlers.forEach(handler => handler());
        },
        _simulateData: (data) => {
            dataHandlers.forEach(handler => handler(data));
        },
        _simulateError: (error) => {
            errorHandlers.forEach(handler => handler(error));
        },
        _isConnected: () => connected
    };

    return socket;
}

/**
 * Mock net.createConnection
 */
function createMockNet() {
    return {
        createConnection: (path) => {
            return createMockNetSocket();
        }
    };
}

module.exports = {
    mockLogger,
    createMockFs,
    createMockSpawn,
    createMockExecSync,
    createMockNet,
    createMockNetSocket
};

