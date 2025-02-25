#!/bin/bash
# This script sets up Nginx as a reverse proxy for your Node.js app on port 3000,
# obtains a free SSL certificate from Let’s Encrypt via Certbot, and configures HTTPS
# for your domain: silverbacksethdenver2025.win.

# Exit immediately if a command exits with a non-zero status.
set -e

DOMAIN="silverbacksethdenver2025.win"
EMAIL="admin@silverbacksethdenver2025.win"  # Replace with your email

echo "Updating package lists..."
sudo apt update

echo "Installing Nginx, Certbot and the Certbot Nginx plugin..."
sudo apt install -y nginx certbot python3-certbot-nginx

echo "Creating Nginx configuration for $DOMAIN..."
# Create an Nginx site config for your domain
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

echo "Enabling site configuration and disabling default..."
# Enable the new configuration and disable the default
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "Testing Nginx configuration..."
sudo nginx -t

echo "Reloading Nginx..."
sudo systemctl reload nginx

echo "Obtaining SSL certificate for $DOMAIN via Certbot..."
# Obtain (and install) the certificate using the Nginx plugin.
sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m ${EMAIL}

echo "SSL setup complete!"
echo "Your website is now available at https://${DOMAIN}"
echo "To test certificate renewal run: sudo certbot renew --dry-run"
