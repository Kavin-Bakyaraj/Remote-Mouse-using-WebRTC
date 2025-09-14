const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io-client');
const { spawn } = require('child_process');
const os = require('os');

// Start a persistent PowerShell process for better performancep
const psProcess = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Movement batching for ultra-low latency mouse control
let pendingMovements = [];
let movementTimer = null;
const MOVEMENT_BATCH_DELAY = 2; // Ultra-low latency: 2ms (~500fps processing)

psProcess.stdout.on('data', (data) => {
  console.log('PowerShell output:', data.toString());
});

psProcess.stderr.on('data', (data) => {
  console.log('PowerShell error:', data.toString());
});

// Send initial setup commands with optimized cursor settings
psProcess.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n');
psProcess.stdin.write('Add-Type -AssemblyName System.Drawing\n');
psProcess.stdin.write(`
# Set high-performance cursor movement using simplified Win32 API
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public struct POINT {
    public int X;
    public int Y;
}

public class Win32Cursor {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);
}
"@
\n`);

const robot = {
  getScreenSize: () => ({ width: 1920, height: 1080 }),
  
  // Batched movement processing for smoother cursor control
  processPendingMovements: () => {
    if (pendingMovements.length === 0) return;
    
    // Accumulate all pending movements
    let totalDeltaX = 0;
    let totalDeltaY = 0;
    
    for (const movement of pendingMovements) {
      totalDeltaX += movement.deltaX;
      totalDeltaY += movement.deltaY;
    }
    
    // Clear pending movements
    pendingMovements = [];
    
    // Apply direct movement with optimized sensitivity for minimal latency
    const smoothedDeltaX = Math.round(totalDeltaX * 1.5); // Reduced from 2.2x for precision
    const smoothedDeltaY = Math.round(totalDeltaY * 1.5);
    
    if (Math.abs(smoothedDeltaX) > 0 || Math.abs(smoothedDeltaY) > 0) {
      // Ultra-fast PowerShell command with minimal overhead
      const cmd = `$p=[System.Windows.Forms.Cursor]::Position;$p.X+=[Math]::Max(-50,[Math]::Min(50,${smoothedDeltaX}));$p.Y+=[Math]::Max(-50,[Math]::Min(50,${smoothedDeltaY}));[System.Windows.Forms.Cursor]::Position=$p\n`;
      
      try {
        psProcess.stdin.write(cmd);
        // Removed console.log for performance
      } catch (error) {
        console.log('Movement error:', error);
      }
    }
  },
  
  moveMouse: (deltaX, deltaY) => {
    // Add to pending movements
    pendingMovements.push({ deltaX, deltaY });
    
    // Process immediately for ultra-low latency (no setImmediate delay)
    if (pendingMovements.length === 1) {
      robot.processPendingMovements();
    }
    
    // Clear any existing timer and start fresh
    if (movementTimer) {
      clearTimeout(movementTimer);
    }
    
    // Start batch timer for rapid movements
    movementTimer = setTimeout(() => {
      robot.processPendingMovements();
      movementTimer = null;
    }, MOVEMENT_BATCH_DELAY);
  },
  mouseClick: (button) => {
    console.log(`Attempting mouse click: ${button}`);
    const isLeft = button === 'left';
    const downFlag = isLeft ? 0x0002 : 0x0008;  // LEFTDOWN or RIGHTDOWN
    const upFlag = isLeft ? 0x0004 : 0x0010;    // LEFTUP or RIGHTUP
    
    const cmd = `
      try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseSim {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
}
"@
        [MouseSim]::mouse_event(${downFlag}, 0, 0, 0, [IntPtr]::Zero);
        Start-Sleep -Milliseconds 50;
        [MouseSim]::mouse_event(${upFlag}, 0, 0, 0, [IntPtr]::Zero);
        Write-Host "Mouse click executed: ${button}"
      } catch {
        Write-Host "Error in mouse click: \$_"
      }
    `;
    try {
      psProcess.stdin.write(cmd + '\n');
      console.log(`PowerShell command sent for ${button} click`);
    } catch (error) {
      console.log('Error writing to PowerShell stdin:', error);
    }
  },
  keyToggle: (key, action) => {
    const keyMap = {
      'up': '{UP}',
      'down': '{DOWN}',
      'left': '{LEFT}',
      'right': '{RIGHT}',
      'a': 'a',
      'space': ' ',
      'enter': '{ENTER}'
    };
    if (keyMap[key]) {
      const cmd = `[System.Windows.Forms.SendKeys]::SendWait('${keyMap[key]}')\n`;
      psProcess.stdin.write(cmd);
    }
  },
  scrollMouse: (delta) => {
    console.log(`Scrolling mouse: ${delta}`);
    const scrollAmount = Math.round(delta / 120); // Convert to scroll units
    const cmd = `
      try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseScroll {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, IntPtr dwExtraInfo);
}
"@
        [MouseScroll]::mouse_event(0x0800, 0, 0, ${scrollAmount * 120}, [IntPtr]::Zero);
        Write-Host "Mouse scroll executed: ${scrollAmount}"
      } catch {
        Write-Host "Error in mouse scroll: \$_"
      }
    `;
    try {
      psProcess.stdin.write(cmd + '\n');
      console.log(`PowerShell scroll command sent: ${scrollAmount}`);
    } catch (error) {
      console.log('Error writing scroll to PowerShell stdin:', error);
    }
  },

  sendKey: (key, modifiers) => {
    console.log(`Sending key: ${key} with modifiers:`, modifiers);

    // Handle special keys
    const specialKeys = {
      'Tab': '{TAB}',
      'Enter': '{ENTER}',
      'Backspace': '{BACKSPACE}',
      ' ': ' '
    };

    let keyCommand = specialKeys[key] || key;

    // Add modifiers
    if (modifiers.includes('Shift')) {
      keyCommand = `+${keyCommand}`;
    }

    const cmd = `[System.Windows.Forms.SendKeys]::SendWait('${keyCommand}')\n`;

    try {
      psProcess.stdin.write(cmd);
      console.log(`Keyboard command sent: ${keyCommand}`);
    } catch (error) {
      console.log('Error sending keyboard command:', error);
    }
  },

  sendShortcut: (modifiers, key) => {
    console.log(`Sending shortcut: ${modifiers.join('+')}+${key}`);

    // Map modifier names to SendKeys format
    const modifierMap = {
      'Control': '^',
      'Alt': '%',
      'Shift': '+'
    };

    let shortcutCommand = '';
    
    // Add modifiers
    modifiers.forEach(mod => {
      if (modifierMap[mod]) {
        shortcutCommand += modifierMap[mod];
      }
    });

    // Handle special keys
    const specialKeys = {
      '{F4}': '{F4}',
      'c': 'c',
      'v': 'v',
      'z': 'z',
      'y': 'y',
      'a': 'a',
      's': 's',
      'r': 'r'
    };

    shortcutCommand += specialKeys[key] || key;

    const cmd = `[System.Windows.Forms.SendKeys]::SendWait('${shortcutCommand}')\n`;

    try {
      psProcess.stdin.write(cmd);
      console.log(`Shortcut command sent: ${shortcutCommand}`);
    } catch (error) {
      console.log('Error sending shortcut command:', error);
    }
  },

  handlePinchGesture: (direction, delta) => {
    console.log(`Pinch gesture: ${direction}, delta: ${delta}`);
    
    // Convert pinch to zoom shortcut
    if (direction === 'in') {
      // Zoom in (Ctrl + Plus)
      robot.sendShortcut(['Control'], '{ADD}');
    } else if (direction === 'out') {
      // Zoom out (Ctrl + Minus)
      robot.sendShortcut(['Control'], '{SUBTRACT}');
    }
  }
};

app.use(express.static('public'));

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const signalingIP = getLocalIP();
console.log('Signaling IP:', signalingIP);
const socket = io(`http://${signalingIP}:3000`);

socket.on('connect', () => {
  console.log('Connected to signaling server');
  socket.emit('join', 'controlled');
});

socket.on('connect_error', (error) => {
  console.log('Connection error:', error);
});

socket.on('input', (msg) => {
  console.log('Received input:', JSON.stringify(msg));
  handleInput(msg);
});

// Handle ping for connection quality monitoring
socket.on('ping', (data) => {
  socket.emit('pong', { timestamp: data.timestamp });
});

function handleInput(msg) {
  console.log('Received input:', msg);
  if (msg.type === 'button') {
    const keyMap = {
      'up': 'up',
      'down': 'down',
      'left': 'left',
      'right': 'right',
      'a': 'a'
    };
    if (keyMap[msg.action]) {
      robot.keyToggle(keyMap[msg.action], msg.data);
    }
  } else if (msg.type === 'mouse') {
    if (msg.action === 'move') {
      // Direct delta movement for optimal smoothness
      robot.moveMouse(msg.data.x, msg.data.y);
    } else if (msg.action === 'click') {
      robot.mouseClick(msg.data);
    } else if (msg.action === 'scroll') {
      robot.scrollMouse(msg.data.delta);
    }
  } else if (msg.type === 'keyboard') {
    if (msg.action === 'key') {
      robot.sendKey(msg.data.key, msg.data.modifiers || []);
    } else if (msg.action === 'shortcut') {
      robot.sendShortcut(msg.data.modifiers || [], msg.data.key);
    }
  } else if (msg.type === 'gesture') {
    if (msg.action === 'pinch') {
      robot.handlePinchGesture(msg.data.direction, msg.data.delta);
    }
  }
}

server.listen(3001, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`Controlled server running on http://${ip}:3001`);
  console.log(`Status page: http://${ip}:3001`);
  console.log('This device is ready to be controlled.');
});

// Cleanup on exit
process.on('exit', () => {
  if (movementTimer) {
    clearTimeout(movementTimer);
  }
  if (psProcess) {
    psProcess.stdin.end();
    psProcess.kill();
  }
});

process.on('SIGINT', () => {
  if (movementTimer) {
    clearTimeout(movementTimer);
  }
  if (psProcess) {
    psProcess.stdin.end();
    psProcess.kill();
  }
  process.exit();
});
