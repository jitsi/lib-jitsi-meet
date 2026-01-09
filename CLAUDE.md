# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## lib-jitsi-meet Architecture

This is the JavaScript library for accessing Jitsi Meet server-side deployments. It provides WebRTC functionality, XMPP communication, and media handling for Jitsi Meet clients.

## Common Development Commands

### Build Commands
```bash
npm run build           # Full build (webpack UMD bundle + TypeScript compilation)
npm run build:webpack   # Build UMD bundle only for browser <script> tags
npm run build:webpack-dev # Development webpack bundle
npm run build:tsc       # TypeScript compilation only for ESM modules
npm run watch           # Development build with file watching
```

### Development Commands

**Testing:**
- `npm test` - Run all tests via Karma (single run)
- `npm run test-watch` - Run tests in watch mode
- Tests use Jasmine framework with Chrome headless browser

**Code Quality:**
- `npm run lint` - ESLint + TypeScript type checking
- `npm run lint-fix` - Auto-fix linting issues
- `npm run type-check` - TypeScript type checking only

**Documentation:**
- `npm run typedoc` - Generate TypeScript documentation

**Other:**
 - `npm run gen-types` - Generate TypeScript declaration file

### TypeScript Migration

New features should be implemented only with TypeScript. When modifying existing JavaScript files, consider converting to TypeScript. The codebase is actively migrating from JavaScript to TypeScript.

**TypeScript Conventions:**
- 4-space indentation, LF line endings
- TypeScript enums for constant groups
- Interfaces for major components during transition
- Use strict type checking and avoid `any`, `unknown` and `object` type
- Strong type checking enabled in tsconfig.json

### Key Dependencies

**Core Libraries:**
- `strophe.js` - XMPP client library (custom Jitsi fork)
- `webrtc-adapter` - WebRTC compatibility shim
- `sdp-transform` - SDP parsing and manipulation
- `@jitsi/logger` - Logging framework
- `@jitsi/js-utils` - Jitsi JavaScript utilities

**Development:**
- Webpack for bundling (UMD and ES modules)
- Karma + Jasmine for testing
- ESLint with @jitsi/eslint-config
- TypeScript compiler

### Configuration Files
- `webpack.config.js` + `webpack-shared-config.js` - Webpack configuration for UMD builds
- `tsconfig.json` - TypeScript configuration with ES2020 target
- `karma.conf.js` - Test runner configuration
- `.eslintrc.js` - ESLint with TypeScript support
- `tools/gen-version.js` - Version generation script

### Testing Guidelines

- Tests located alongside source files with `.spec.ts` extension
- Karma runs tests in Chrome headless browser
- Tests include both TypeScript and JavaScript files during migration
- Use Jasmine framework for assertions and test structure

## Code Architecture

### Core API Structure
- **JitsiMeetJS.ts** - Main library entry point exposing the public API
- **JitsiConnection.ts** - XMPP connection management and authentication
- **JitsiConference.js** - Video conference session representation
- **JitsiParticipant.ts** - Conference participant abstraction
- **JitsiTrack/JitsiLocalTrack/JitsiRemoteTrack** - Media track management

### Module Organization

**RTC Module** (`/modules/RTC/`):
- Core WebRTC functionality, track management, and screen sharing
- **TraceablePeerConnection.js** - Enhanced PeerConnection with debugging
- **RTCUtils.js** - Browser compatibility and WebRTC utilities

**XMPP Module** (`/modules/xmpp/`):
- XMPP/Jingle protocol implementation for signaling
- **ChatRoom.js** - Multi-user chat room with presence management
- **JingleSessionPC.js** - Jingle protocol for media negotiation
- **SignalingLayerImpl.js** - Abstraction layer for signaling
- **Strophe plugins** - Protocol extensions (disco, ping, stream-management, etc.)

**E2EE Module** (`/modules/e2ee/`):
- End-to-end encryption using insertable streams and SFrame
- **Worker.js** - Web worker for E2EE processing (separate webpack entry)
- **OlmAdapter.js** - Integration with Olm for key management

**Quality Control** (`/modules/qualitycontrol/`):
- Video quality adaptation and codec selection
- **ReceiveVideoController/SendVideoController** - Stream management

**Service Layer** (`/service/`):
- Type-safe constants, events, and enums
- Well-defined event system used throughout the library

### Build System Architecture
- **Dual output**: UMD bundle (`dist/umd/`) and ESM modules (`dist/esm/`)
- **Webpack configuration**: Shared config with separate UMD and E2EE worker builds
- **TypeScript migration**: Gradual migration with both `.js` and `.ts` files coexisting
- **Testing**: Karma + Jasmine with webpack preprocessing for both JS and TS files

### Key Design Patterns
- **Event-driven architecture**: Extensive use of EventEmitter throughout all modules
- **Protocol abstraction**: Clean separation between XMPP signaling and WebRTC media
- **Modular design**: Self-contained modules with clear dependencies
- **Browser compatibility**: webrtc-adapter integration and capability detection

### Development Notes
- Tests are located alongside source files with `.spec.js/.spec.ts` extensions
- TypeScript types are maintained in `/types` directory for gradual migration
- Main library exposes both ESM (`JitsiMeetJS.js`) and UMD (`lib-jitsi-meet.min.js`) builds
- E2EE worker is built as separate bundle for web worker usage
- Maintain backward compatibility in public API

## Integration with jitsi-meet

### Dependency Management
- **NOT published to npm** - Uses GitHub releases for distribution
- Default jitsi-meet dependency: `"lib-jitsi-meet": "https://github.com/jitsi/lib-jitsi-meet/releases/download/v<version>+<commit-hash>/lib-jitsi-meet.tgz"`
- Package artifacts generated with `npm pack` command

### Local Development Workflow
1. **Using npm pack** (recommended):
   ```bash
   # In lib-jitsi-meet directory
   npm pack
   # In jitsi-meet directory
   npm install file:///path/to/lib-jitsi-meet-<version>.tgz --force && make
   ```

2. **Using npm link** (simpler but won't work for mobile builds):
   ```bash
   # In lib-jitsi-meet directory
   npm link
   # In jitsi-meet directory
   npm link lib-jitsi-meet
   # Rebuild after changes
   cd node_modules/lib-jitsi-meet && npm run build
   ```

3. **Unlinking when done**:
   ```bash
   npm unlink lib-jitsi-meet
   npm install
   ```

### Integration Commands
- **Full rebuild**: `npm install lib-jitsi-meet --force && make`
- **Library only**: `npm install lib-jitsi-meet --force && make deploy-lib-jitsi-meet`
- **Development changes**: Rebuild with `npm run build` in lib-jitsi-meet

## Code Style and Conventions

### Commit Message Format
Follow [Conventional Commits](https://www.conventionalcommits.org) with **mandatory module scopes**:
```
feat(RTC): add new WebRTC functionality
fix(xmpp): resolve Jingle negotiation issue
docs(JitsiConnection): update connection API documentation
```

Module scope examples:
- `RTC` - WebRTC functionality
- `xmpp` - XMPP/Jingle signaling
- `e2ee` - End-to-end encryption
- `qualitycontrol` - Video quality management
- `service` - Events, constants, and type definitions
- `JitsiConnection`, `JitsiConference`, etc. - Main API classes

### Testing Requirements
- Write tests for new functionality using Jasmine syntax
- Place test files alongside source with `.spec.js/.spec.ts` extension
- Test both success and error scenarios
- Mock external dependencies (XMPP connections, WebRTC APIs)
- Ensure tests work with both Karma test runner and direct Node.js execution

## Architecture Best Practices

### Event System
- Use typed events from `/service/` directory
- Follow EventEmitter pattern consistently
- Document event parameters and timing in JSDoc comments
- Emit events for all significant state changes

### Module Design
- Keep modules self-contained with minimal cross-dependencies
- Use clear interfaces between XMPP signaling and WebRTC media layers
- Abstract protocol details behind higher-level APIs
- Provide consistent error handling and reporting

### WebRTC Integration
- Use TraceablePeerConnection for enhanced debugging
- Handle browser compatibility through RTCUtils abstraction
- Implement proper track lifecycle management

### XMPP Protocol Handling
- Implement Strophe plugins for protocol extensions
- Handle connection states and recovery scenarios
- Support both BOSH and WebSocket transports
- Maintain protocol compliance with XEP specifications

## Common Development Scenarios

### Adding New WebRTC Features
1. Implement core functionality in `/modules/RTC/`
2. Add XMPP signaling support in `/modules/xmpp/`
3. Expose through main API classes (JitsiConference, JitsiConnection)
4. Update TypeScript definitions
5. Add comprehensive tests
6. Document public API changes

### Protocol Extensions
1. Create Strophe plugin in `/modules/xmpp/strophe.*.js`
2. Integrate with existing signaling layer
3. Add event definitions in `/service/`
4. Test with both BOSH and WebSocket transports
5. Ensure backward compatibility

### Quality Control Enhancements
1. Modify controllers in `/modules/qualitycontrol/`
2. Update codec preferences and constraints
3. Test across different network conditions
4. Verify mobile and desktop compatibility
5. Monitor performance impact

## External Resources
- [Jitsi Handbook](https://jitsi.github.io/handbook/) - Comprehensive documentation
- [lib-jitsi-meet Development Guide](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ljm/)
- [jitsi-meet Integration Guide](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ljm-api/)
- [XMPP Protocol Specifications](https://xmpp.org/extensions/) - XEP documentation
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) - Browser WebRTC APIs

### Code Style
- Follow @jitsi/eslint-config rules
- TypeScript member ordering enforced
- Sort object keys in ascending order
- 4-space indentation consistently
- JSDoc comments required
