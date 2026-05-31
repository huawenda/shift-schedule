# Web Deployment

This project builds the Taro H5 app into `dist-h5` and serves it with Nginx in Docker.

## Build And Run On The Server

```bash
git clone <your-repo-url>
cd shift-schedule-miniapp
cp .env.example .env
nano .env
docker compose up -d --build
```

Open:

```text
http://<server-ip>:10086
```

The normal Web login passcode is `WEB_ACCESS_CODE` in `.env`.
The administrator login passcode is `ADMIN_ACCESS_CODE` in `.env`.
Only `ADMIN_PERSON_NAME` with `ADMIN_ACCESS_CODE` receives administrator permissions.

## Update Deployment

```bash
cd shift-schedule-miniapp
git pull
docker compose up -d --build --remove-orphans
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
docker compose up -d --build
```

## Useful Commands

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
```

## Database Access And Permissions

Open a PostgreSQL shell:

```bash
docker exec -it shift-schedule-postgres psql -U shift_schedule -d shift_schedule
```

List recent Web login sessions:

```sql
SELECT id, person_name, user_agent, created_ip, created_at_text, expires_at_text, revoked_at_text
FROM login_sessions
ORDER BY created_at DESC
LIMIT 20;
```

Disable a user account and make all cached browser tokens fail on the next request:

```sql
UPDATE user_profiles
SET enabled = FALSE
WHERE person_name = '张舒琪';
```

Enable the user again:

```sql
UPDATE user_profiles
SET enabled = TRUE
WHERE person_name = '张舒琪';
```

Revoke all active sessions for one person:

```sql
UPDATE login_sessions
SET revoked_at = EXTRACT(EPOCH FROM now()) * 1000,
    revoked_at_text = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
WHERE person_name = '张舒琪'
  AND revoked_at IS NULL;
```
