Jitsi Meet API
============

You can use Jitsi Meet API to create Jitsi Meet video conferences with custom GUI.

## Installation

[Checkout the examples.](doc/API.md#installation)

## Building the sources

Jitsi Meet uses [Browserify](http://browserify.org). If you want to make changes in the code you need to [install Browserify](http://browserify.org/#install). Browserify requires [nodejs](http://nodejs.org). 

On Debian/Ubuntu systems, the required packages can be installed with:
```
sudo apt-get install npm nodejs
```

To build the Lib Jitsi Meet, just type
```
npm install
```

For development, use watch to recompile your browserify bundle on file changes:

```
npm run watch
```

## Discuss
Please use the [Jitsi dev mailing list](http://lists.jitsi.org/pipermail/dev/) to discuss feature requests before opening an issue on Github. 
