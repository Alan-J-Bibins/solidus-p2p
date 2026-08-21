# Solidus

A modular framework that unifies real-time CRDT state synchronization, peer networking, and state-aware binary asset routing into a zero-boilerplate developer interface.

---

### Core Architecture

**1. Universal State Synchronization**

- **JS/TS Proxy Layer**: `createState()` wraps native JavaScript objects with Proxies, intercepting standard mutations and translating them directly into CRDT operations to eliminate vendor lock-in].
- **Asset-State Decoupling**: Stores lightweight, content-addressed references in the state tree while streaming heavy media out-of-band to prevent CRDT database bloat.
- **CRDT Provider Agnostic**: Native adapter engine supporting backends like Yjs, Collabs, and Automerge.

**2. State-Aware Data Routing & Management**

- **Content-Defined Chunking**: Slices multimedia files into deterministic byte chunks to stream and diff modified asset blocks efficiently.
- **Priority Backpressure Scheduling**: Interleaves real-time state updates over reliable channels while dynamically throttling heavy asset streams to preserve low state-latency].
- **Resumable Local Persistence**: Automatically caches incoming blocks into IndexedDB, allowing aborted transfers to resume missing chunk ranges on reconnect.
- **Multi-Peer Swarming**: Enables clients to pull missing asset chunks concurrently from multiple room peers via storage pooling].

**3. Transport & Networking Engine**

- **Modular Transport**: Pluggable transport architecture supporting WebRTC Data Channels, WebSockets, and WebTransport.
- **Pluggable Signaling**: Decoupled signaling interface supporting WebSockets, serverless trackers, or direct SDP exchange.
- **Lifecycle State Machine**: Event-driven architecture providing fine-grained hooks for peer discovery, NAT traversal, connection dropouts, and network recovery.

**4. Hybrid Topologies & Node Capabilities**

- **Capability Engine**: Replaces hardcoded topologies by declaring node roles (`CLIENT`, `RELAY`, `PERSISTENCE`, `COMPUTE`) to dynamically construct mesh, star, or superpeer networks.
- **Hybrid Cloud Failover**: Treats backend servers or CDNs as `PERSISTENCE` peers of last resort, seamlessly falling back to standard HTTP chunk fetches if all P2P seeders disconnect.
- **Plugin Architecture**: Pub/sub middleware system for injecting custom encryption, spatial interest filters, or data compression pipelines.
