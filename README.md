# Remote Mouse Controller

A simple remote mouse control system that allows you to control your PC mouse cursor from your mobile phone using touch gestures.

## Features

- **Touch-based mouse control**: Move your PC cursor by dragging on your mobile screen
- **Click support**: Left and right click buttons for mouse interactions
- **Real-time movement**: Smooth cursor movement with relative positioning
- **No installation required**: Uses built-in Windows PowerShell (no SDK needed)
- **Cross-device control**: Works on any mobile device connected to the same network

## Quick Setup

### 1. Network Connection
- Create a mobile hotspot on your laptop
- Connect your mobile phone to the hotspot
- Both devices must be on the same network

### 2. Install Dependencies
```bash
# Main server
npm install

# Controlled server
cd controlled
npm install
```

### 3. Start Servers
```bash
# Terminal 1 - Signaling server
npm start

# Terminal 2 - Controlled server
cd controlled
npm start
```

### 4. Connect Mobile
- Open mobile browser to: `http://[LAPTOP_IP]:3000`
- Use touch gestures to move cursor
- Tap click buttons for mouse interactions

## How It Works

- **Controller**: Mobile web interface captures touch movements
- **Signaling**: Socket.IO handles real-time communication
- **Controlled**: PowerShell simulates mouse movements on PC
- **Movement**: Relative positioning for smooth, continuous control

## Requirements

- Node.js installed
- Windows PC (uses PowerShell)
- Mobile device with web browser
- Both devices on same network

## Usage

1. Start both servers on your PC
2. Connect mobile to PC's hotspot
3. Open controller URL on mobile
4. Drag finger to move cursor
5. Tap buttons to click

That's it! Simple remote mouse control without any complex setup.
