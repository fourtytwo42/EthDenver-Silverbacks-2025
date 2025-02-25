# Silverbacks Website

The Silverbacks Website is a React-based frontend for the EthDenver-Silverbacks-2025 project. It interacts with our smart contracts (for NFT minting, redemption, etc.) and provides a user-friendly interface. In production, the app is built into static files and served via PM2.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Deploying with PM2](#deploying-with-pm2)
- [PM2 Auto-Startup](#pm2-auto-startup)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

This project is built with React (using Create React App) and integrates with Ethereum smart contracts. In production, the React app is built into static assets that are then served with PM2. Additionally, you can use Nginx and Certbot (instructions not covered in full here) to set up HTTPS.

## Prerequisites

- **Node.js & npm**: Install Node.js (v14 or higher recommended) and npm.
- **PM2**: Install PM2 globally by running:
  ```bash
  npm install -g pm2
  ```
- **Git**: To clone the repository.
- **(Optional) Nginx & Certbot**: If you plan to set up HTTPS for your domain.

## Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/fourtytwo42/EthDenver-Silverbacks-2025.git
   cd EthDenver-Silverbacks-2025/silverbacks-frontend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

## Development

To run the application in development mode (with hot reloading), use:
```bash
npm start
```
This launches the app on [http://localhost:3000](http://localhost:3000).

## Building for Production

To create a production-ready build, run:
```bash
npm run build
```
This command generates a `build` folder containing static assets optimized for production.

## Deploying with PM2

Since React apps are built as static files, you cannot run the source directly using Node.js. Instead, serve the `build` folder using PM2’s built-in static file server.

1. **Build the Project**
   ```bash
   npm run build
   ```

2. **Serve the Production Build with PM2**
   ```bash
   pm2 serve build 3000 --name silverbacks
   ```
   This command instructs PM2 to serve the `build` folder on port `3000` and names the process "silverbacks".

### Useful PM2 Commands

- **List running processes:**
  ```bash
  pm2 list
  ```
- **View logs for the "silverbacks" process:**
  ```bash
  pm2 logs silverbacks
  ```
- **Restart the process:**
  ```bash
  pm2 restart silverbacks
  ```
- **Stop the process:**
  ```bash
  pm2 stop silverbacks
  ```

## PM2 Auto-Startup

To ensure your application restarts after a system reboot:

1. Save the current process list:
   ```bash
   pm2 save
   ```
2. Set PM2 to startup automatically:
   ```bash
   pm2 startup
   ```
   Follow the on-screen instructions to complete the setup.

## How It Works

- **Frontend Application:**  
  Built with React, the app communicates with Ethereum smart contracts using Ethers.js. It allows users to deposit stablecoins, mint NFTs, redeem tokens, and perform batch operations.

- **Production Deployment:**  
  The production build is a collection of static files (HTML, CSS, JavaScript) that is served by PM2. PM2 manages the process and ensures high availability.

- **Integration with Smart Contracts:**  
  The frontend interacts with deployed contracts (such as an ERC20 token and ERC721 NFT contract) to perform operations like minting and redeeming NFTs.

- **SSL/HTTPS Setup (Optional):**  
  Although not covered in this README, you can set up HTTPS with Nginx as a reverse proxy and Certbot to obtain a free SSL certificate from Let’s Encrypt.

## Troubleshooting

- **ES Module Error:**  
  Do not attempt to run the React source code directly (e.g., `node src/index.js`). Always build the project using `npm run build` and then serve the static files.

- **PM2 Issues:**  
  If you see errors regarding `import` statements, ensure you are serving the built `build` directory rather than the source code. Check logs with `pm2 logs silverbacks`.

- **DNS/SSL Issues:**  
  If Certbot reports DNS errors, double-check that your domain’s DNS records (both A and AAAA) are correctly set up and have propagated.

## Contributing

Contributions are welcome! Please fork the repository, create a feature branch, and submit a pull request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
