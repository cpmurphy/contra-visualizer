# Contra Visualizer

A way to see contra dances and practice calling them

![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- All Javascript: runs in your browser on a phone or PC
- Optional music and metronome
- Optional karaoke-style calling prompts

## Quick Setup

### Zero Setup -- Just View It Online

You can load the [contra visualizer](https://cpmurphy.github.io/contra-visualizer/)
directly, served from Github Pages.

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

### Hosting on GitHub Pages

There is nothing to build. The published site is the `main` branch.
`.nojekyll` tells GitHub to publish those files as they are.

On GitHub, open the repository's Settings, then Pages. Under "Build and
deployment", choose "Deploy from a branch". Choose the `main` branch and
the `/ (root)` folder, then Save.

That address shows on the Pages screen after the first build finishes,
which takes about a minute. Later pushes to `main` update it. GitHub
Pages serves a public repository for free.

### Self Hosting

It's just a matter of copying the repo contents to a server you control.
For more detailed instructions, use a good search engine or your favourite
AI.
