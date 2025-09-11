const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io-client');
const { spawn } = require('child_process');

let robot;
let psProcess;

try {
  robot = require('robotjs');
  console.log('robotjs loaded successfully');
} catch (e) {
  console.log('robotjs not available, using PowerShell fallback');

  // Start a persistent PowerShell process for better performance
  psProcess = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  psProcess.stdout.on('data', (data) => {
    console.log('PowerShell output:', data.toString());
  });

  psProcess.stderr.on('data', (data) => {
    console.log('PowerShell error:', data.toString());
  });

  // Send initial setup commands
  psProcess.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n');
  psProcess.stdin.write('Add-Type -AssemblyName System.Drawing\n');

  robot = {
    getScreenSize: () => ({ width: 1920, height: 1080 }),
    moveMouse: (deltaX, deltaY) => {
      const cmd = `
        $currentPos = [System.Windows.Forms.Cursor]::Position
        $newX = [Math]::Max(0, [Math]::Min(1919, ($currentPos.X + ${Math.round(deltaX * 3)})))
        $newY = [Math]::Max(0, [Math]::Min(1079, ($currentPos.Y + ${Math.round(deltaY * 3)})))
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($newX, $newY)
        Write-Host "Moved to: $newX, $newY"
      `;
      try {
        psProcess.stdin.write(cmd + '\n');
        console.log(`Moving mouse by delta: ${deltaX}, ${deltaY}`);
      } catch (error) {
        console.log('Error writing to PowerShell stdin:', error);
      }
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
    }
  };
} // Uncomment after fixing compilation
const os = require('os');

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
      const screenSize = robot.getScreenSize();
      const x = Math.round(msg.data.x * screenSize.width / 400);
      const y = Math.round(msg.data.y * screenSize.height / 300);
      robot.moveMouse(x, y);
    } else if (msg.action === 'click') {
      robot.mouseClick(msg.data);
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
  if (psProcess) {
    psProcess.stdin.end();
    psProcess.kill();
  }
});

process.on('SIGINT', () => {
  if (psProcess) {
    psProcess.stdin.end();
    psProcess.kill();
  }
  process.exit();
});
