require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 5000;
const QUICKNODE_IPFS_URL = process.env.QUICKNODE_IPFS_URL || 'https://rays-automobile-clearly.quicknode-ipfs.com';

app.use(cors());
app.use(express.json());

// Proxy endpoint for IPFS API calls.
// Requests to /api/ipfs/* will be forwarded to QUICKNODE_IPFS_URL with a path rewrite.
app.use('/api/ipfs', createProxyMiddleware({
  target: QUICKNODE_IPFS_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/ipfs': '/api/v0'
  }
}));

app.get('/', (req, res) => {
  res.send('IPFS Proxy is running');
});

app.listen(PORT, () => {
  console.log(`IPFS Proxy listening on port ${PORT}`);
});
