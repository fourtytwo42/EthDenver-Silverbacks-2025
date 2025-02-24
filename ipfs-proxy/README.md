# IPFS Proxy

This is a simple Node.js proxy server that allows you to upload and read from IPFS without encountering CORS issues.

## Setup

1. Run `npm install` to install dependencies.
2. Run `npm start` to start the proxy server.

The server listens on the port specified in the `.env` file (default is 5000).

## Endpoints

- `GET /`: Returns a simple message.
- `/api/ipfs/*`: Proxies requests to the IPFS API.
  - For example:
    - `POST /api/ipfs/add`: Upload (and pin) files to IPFS.
    - `GET /api/ipfs/cat?arg=CID`: Read content from IPFS.
