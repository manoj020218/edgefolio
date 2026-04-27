# VPS Deployment — edgefolio.iotsoft.in

Run these commands **on your VPS** to deploy the marketing page.

## 1. Clone the repo into public-credit

```bash
cd /root/projects/public-credit
git clone https://github.com/manoj020218/edgefolio.git edgefolio
cd edgefolio/VPS/marketing
pnpm install
```

## 2. Start with PM2

```bash
pm2 start /root/projects/public-credit/edgefolio/VPS/config/pm2-edgefolio.config.js
pm2 save
```

## 3. Set up Nginx

```bash
sudo cp /root/projects/public-credit/edgefolio/VPS/config/nginx-edgefolio.conf /etc/nginx/sites-available/edgefolio
sudo ln -s /etc/nginx/sites-available/edgefolio /etc/nginx/sites-enabled/edgefolio
sudo nginx -t && sudo systemctl reload nginx
```

## 4. SSL certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d edgefolio.iotsoft.in
```

## 5. Verify

Visit https://edgefolio.iotsoft.in — should show the EDGEFOLIO landing page.

## Updates (future)

```bash
cd /root/projects/public-credit/edgefolio
git pull origin master
pm2 restart edgefolio-marketing
```
