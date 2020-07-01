# Jitsi Meet API library

You can use Jitsi Meet API to create Jitsi Meet video conferences with a custom GUI.

## Installation

[Checkout the examples.](doc/API.md#installation)

## Building the sources

NOTE: you need Node.js >= 8 and npm >= 5.6.0

To build the library, just type:
```
npm install
```
To lint:
```
npm run lint
```
and to run unit tests:
```
npm test
```
if use example.js,you need build lib-jitsi-meet.min.js

```
npm run postinstall
```

Both linting and units will also be done by a pre-commit hook.
