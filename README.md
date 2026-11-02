# Contra Visualizer

A way to see contra dances and practice calling them

![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- All Javascript: runs in your browser on a phone or PC
- Optional music and metronome
- Optional karaoke-style calling prompts

## Quick Setup

### Local on Windows

Nothing to install. Double-click `serve.cmd`, or from the project folder run:

```
.\serve.cmd
```

Then load http://localhost:8000 in your browser. Press Ctrl+C in that
window to stop the server.

`serve.cmd` starts `serve.ps1`, which serves this folder with the web
server built into Windows. From PowerShell you can run that script
directly:

```
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

If port 8000 is already in use, pass another port: `.\serve.cmd 8080`.

When Windows allows it, other devices on the same network can use
`http://<this-computer's-name>:8000`. Otherwise the page is only
available on this computer.

### Local on Linux/Mac

Run the `./serve.sh` script. Then load http://localhost:8000 in your
browser (or `http://<your-host-name>:8000` from another device on the
same network). Press Ctrl+C to stop.

### Remote Hosting (e.g. Github Pages)

TODO
