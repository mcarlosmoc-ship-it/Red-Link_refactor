# Guía de despliegue recomendada

Esta guía resume un flujo de despliegue de producción para el backend FastAPI y el frontend Vite, usando PostgreSQL y un proxy inverso con HTTPS configurado correctamente.

## Requisitos del sistema

- Ubuntu/Debian o distro Linux equivalente con `systemd` disponible.
- `python3.10+`, `pip` y `virtualenv` para el backend.
- `node` y `npm` para compilar el frontend (no necesarios si solo sirves artefactos ya construidos).
- Servidor de PostgreSQL accesible desde el host donde correrá la API.
- Acceso para abrir puertos 80/443 (proxy inverso) y 8000 (API interna por defecto).

## Variables y secretos obligatorios

Crea un archivo `.env` en `backend/` con al menos:

- `DATABASE_URL`: URL completa de PostgreSQL, ej. `postgresql+psycopg://user:pass@host:5432/red_link`.
- `CLIENT_PASSWORD_KEY`: clave base64 urlsafe de **32 bytes o más** para cifrar contraseñas de clientes.
- `ADMIN_USERNAME`: usuario permitido para `/auth/token`.
- `ADMIN_PASSWORD_HASH`: hash generado con `backend.app.security.generate_password_hash`.
- `ADMIN_JWT_SECRET`: cadena larga y aleatoria para firmar los JWT.

Opcionales:

- `ADMIN_TOTP_SECRET` y `ACCESS_TOKEN_EXPIRE_MINUTES` para 2FA y expiración de tokens.
- `PORT` si quieres que Uvicorn escuche en otro puerto interno (recuerda reflejarlo en el proxy).

## Configurar PostgreSQL (`DATABASE_URL`)

1. Crea la base y usuario dedicados (ejemplo en `psql`):
   ```sql
   CREATE DATABASE red_link;
   CREATE USER red_link_app WITH ENCRYPTED PASSWORD 'cambia-esta-clave';
   GRANT ALL PRIVILEGES ON DATABASE red_link TO red_link_app;
   ```
2. Exporta o guarda en `backend/.env` la URL con ese usuario:
   ```bash
   export DATABASE_URL="postgresql+psycopg://red_link_app:cambia-esta-clave@localhost:5432/red_link"
   ```
3. En servidores donde sólo correrá la API, considera añadir `?sslmode=require` si la conexión pasa por Internet.

## Instalación y migraciones

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Aplica el esquema
alembic upgrade head
```

Si usas un repositorio de artefactos, construye el frontend antes de desplegar:

```bash
npm install
npm run build   # genera dist/
```

Copia `dist/` al servidor donde lo servirá el proxy inverso.

## Arranque con process manager

### systemd (backend)

1. Crea `/etc/systemd/system/red-link.service`:
   ```ini
   [Unit]
   Description=Red-Link API
   After=network.target

   [Service]
   WorkingDirectory=/opt/red-link/backend
   EnvironmentFile=/opt/red-link/backend/.env
   ExecStart=/opt/red-link/backend/.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
   Restart=on-failure
   User=redlink
   Group=redlink

   [Install]
   WantedBy=multi-user.target
   ```
2. Recarga y habilita:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now red-link
   ```

### PM2 (backend)

```bash
cd backend
pm2 start "uvicorn backend.app.main:app --host 0.0.0.0 --port 8000" --name red-link-api
pm2 save
pm2 startup    # genera el comando para habilitarlo en arranque
```

## Proxy inverso y HTTPS

Expone el frontend estático y enruta `/api` al backend interno.

### Nginx

```nginx
server {
    listen 80;
    server_name ejemplo.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /opt/red-link/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

Tras obtener certificados con Certbot:

```nginx
server {
    listen 80;
    server_name ejemplo.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ejemplo.com;

    ssl_certificate /etc/letsencrypt/live/ejemplo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ejemplo.com/privkey.pem;

    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /opt/red-link/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### Caddy

```caddyfile
ejemplo.com {
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        root * /opt/red-link/frontend/dist
        file_server
        try_files {path} {path}/ /index.html
    }
}
```

Caddy obtiene y renueva certificados Let’s Encrypt automáticamente si el dominio apunta al servidor.

## Checklist de despliegue

1. Configura `backend/.env` con `DATABASE_URL` y secretos.
2. Ejecuta `alembic upgrade head` en el entorno de producción.
3. Construye el frontend (`npm run build`) y coloca `dist/` donde lo pueda servir el proxy.
4. Arranca Uvicorn con `systemd` o PM2.
5. Configura Nginx o Caddy para exponer HTTPS y enrutar `/api` al backend.
6. Verifica los logs y el estado del servicio (`systemctl status red-link` o `pm2 status`).
