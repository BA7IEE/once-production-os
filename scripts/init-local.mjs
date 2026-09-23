import { randomBytes } from 'node:crypto';import { mkdirSync,existsSync,writeFileSync } from 'node:fs';
if(existsSync('.env')||existsSync('.secrets'))throw new Error('Refusing to overwrite existing .env or .secrets; preserve current keys and database credentials.');
mkdirSync('.secrets',{mode:0o700});const write=(path,value)=>writeFileSync(path,value+'\n',{mode:0o600,flag:'wx'});
const db=randomBytes(24).toString('hex');write('.secrets/db.password',db);write('.secrets/contact.hex',randomBytes(32).toString('hex'));write('.secrets/csrf.hex',randomBytes(32).toString('hex'));write('.secrets/recovery.epoch',randomBytes(24).toString('base64url'));write('.secrets/bootstrap.password',randomBytes(24).toString('base64url'));
write('.env',`# Local development only. Never expose this setup as a production deployment.
APP_ENV=local
APP_ORIGIN=http://127.0.0.1:4318
HOST=127.0.0.1
PORT=4318
COOKIE_SECURE=false
TRUST_LOOPBACK_PROXY=false
ACCESS_MODE=INTERNAL
DATABASE_URL=postgresql://once_dev:${db}@127.0.0.1:5436/once_local
CONTACT_KEY_FILE=.secrets/contact.hex
CSRF_KEY_FILE=.secrets/csrf.hex
RECOVERY_EPOCH_FILE=.secrets/recovery.epoch
BOOTSTRAP_LOGIN=owner
BOOTSTRAP_NAME=ONCE管理员
BOOTSTRAP_PASSWORD_FILE=.secrets/bootstrap.password`);
console.log('Local secret files created with restrictive permissions. Passwords were not printed. See docs/release/LOCAL_RUN.md.');
