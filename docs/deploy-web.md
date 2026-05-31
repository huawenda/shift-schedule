# Web Deployment

This project builds the Taro H5 app into `dist-h5` and serves it with Nginx in Docker.

## Build And Run On The Server

```bash
git clone <your-repo-url>
cd shift-schedule-miniapp
docker-compose up -d --build
```

Open:

```text
http://<server-ip>:10086
```

## Update Deployment

```bash
cd shift-schedule-miniapp
git pull
docker-compose up -d --build
docker image prune -f
```

## Use Port 80

Change `docker-compose.yml`:

```yaml
ports:
  - "80:80"
```

Then run:

```bash
docker-compose up -d --build
```

## Useful Commands

```bash
docker-compose ps
docker-compose logs -f
docker-compose restart
docker-compose down
```

