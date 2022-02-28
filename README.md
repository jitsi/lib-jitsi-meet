# Jitsi Meet API library

You can use Jitsi Meet API to create Jitsi Meet video conferences with a custom GUI.

## Installation

- [Installation guide](doc/API.md#installation)
- [Checkout the example](doc/example)

## Building the sources

NOTE: you need Node.js >= 12 and npm >= 7

To build the library, just type:
```
npm install
npm run build
```
To lint:
```
npm run lint
```
and to run unit tests:
```
npm test
```
if you need to rebuild lib-jitsi-meet.min.js
```
npm run build
```

Both linting and units will also be done by a pre-commit hook.
