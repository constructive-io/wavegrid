---
name: wavegrid-cloud-brain
description: Run the Wavegrid brain (server + artist UI) on a public cloud server behind nginx TLS, with receivers dialling out over wss — provisioning, the systemd unit, the nginx WebSocket proxy, deploying a new main, users and receiver keys. Covers the live hipzap.com deployment. Use when deploying or updating the cloud brain, adding UI users, or connecting a receiver to it.
---

# Wavegrid · Cloud brain (hipzap.com)

## Shape

```
browser/iPad ──https──▶ nginx :443 ──▶ wavegrid server :3000 (127.0.0.1)
                                         ▲
show PC: wavegrid receiver ──wss (dials out, receiverKey)──┘ ──OSC/UDP──▶ BEYOND
```

The receiver needs no inbound ports at the venue: it connects out to `wss://<domain>`. Both ends run **from source** at the same commit. Nothing gets published to npm.

## The live deployment

- `https://hipzap.com` (plus www). DigitalOcean droplet `hipzap-web-1` in SFO3, 8 vCPU / 16 GB, Ubuntu 24.04.
- SSH as root, key only. The private key is handed out of band; it is never in the repo. The DigitalOcean API token is the org secret `DIGITALOCEAN_TOKEN`.
- Source is in `/opt/wavegrid`, owned by service user `wavegrid`. Project `saturday`. The store is `/home/wavegrid/.wavegrid/data/projects/saturday/`.
- ufw allows only 22/80/443. fail2ban and unattended-upgrades are on. Certbot renews Let's Encrypt automatically.

## systemd

`/etc/systemd/system/wavegrid.service`:

```ini
[Service]
User=wavegrid
WorkingDirectory=/opt/wavegrid
ExecStart=/usr/bin/node /opt/wavegrid/packages/cli/dist/bin.js server --project <project>
Restart=always
Environment=NODE_ENV=production
StandardInput=null
```

`server` is the brain only, with no receiver. Do not use `start` on a cloud box. Logs: `journalctl -u wavegrid -f`.

## nginx

One `location /` proxies everything (UI, API and the WebSocket) to `127.0.0.1:3000`. It needs the upgrade headers and long timeouts, or receivers drop every 60s:

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 1d; proxy_send_timeout 1d;
```

Then run `certbot --nginx -d <domain> -d www.<domain>` once DNS A records point at the droplet.

## Deploy a new main

From a local checkout of `main` (the droplet has no GitHub credentials, so push the tree over SSH):

```sh
git checkout main && git pull
git archive HEAD | ssh root@<ip> 'tar -x -C /opt/wavegrid && chown -R wavegrid:wavegrid /opt/wavegrid \
  && cd /opt/wavegrid && su wavegrid -c "pnpm install --frozen-lockfile && pnpm build" \
  && systemctl restart wavegrid && systemctl is-active wavegrid'
```

Verify with `curl -s https://<domain>/api/config`, then log in and look at the tabs. Every receiver must then pull the **same** commit and rebuild (`git pull && pnpm install && pnpm build`, restart `wavegrid receiver`). The brain preview and the receiver run the same animation and pattern code, so a version skew shows up as the preview and the lasers disagreeing.

Do not click scenes or paint on the live site to check a deploy if a receiver may be connected to armed lasers. Opening a tab is safe; starting a scene is live output.

## Users, keys and secrets

Everything is created and checked **on the brain**. The receiver never sees a UI password.

```sh
su - wavegrid -c "cd /opt/wavegrid && node packages/cli/dist/bin.js projects users list --project <p> </dev/null"
… projects users add <name> --password <pw> --project <p>
```

The first user in a project is `admin`; later ones are `operator` (they can drive the show but not manage users or keys). The CLI has no role flag. An admin changes a role in the desktop app's user management, or with `POST /api/admin/users/<name>/role {"role":"admin"}` using an admin login token. Re-adding an existing user changes the password and keeps the role.

Changing a password does not log out existing sessions (the JWTs stay valid). The project secrets are `jwtSecret` (signs UI logins) and `receiverKey` (what a receiver presents). Give a receiver the project with `projects export --out <p>.wgproj`, then `projects import <p>.wgproj --activate` and `projects config set receiver.server wss://<domain>` on the receiver. The bundle contains both secrets, so treat it like a password. Only a new `receiverKey` has to be copied back out to receivers.

`wavegrid doctor` on the brain lists the connected receivers and shard coverage.
