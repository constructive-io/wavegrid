import { Copy, KeyRound, MonitorSmartphone, RefreshCw, ShieldCheck, Ticket, Trash2, UserPlus, Users } from 'lucide-react';
import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { roleChangeBlock, userRemovalBlock } from '@/renderer/lib/access-rules';
import type { AccessKeyInfo, RequiredSecretInfo, SessionInfo, UserAccount, UserRole } from '@/types/ipc';

const ROLE_STYLE = 'border-input bg-background h-8 rounded-md border px-2 text-sm';

function relativeTime(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function AddUserDialog({
  existing,
  onAdd,
  busy
}: {
  existing: string[];
  onAdd: (username: string, password: string, role: UserRole) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('operator');
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setUsername('');
    setPassword('');
    setConfirm('');
    setRole('operator');
    setError(null);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const trimmed = username.trim();
  const nameError =
    trimmed === ''
      ? 'Username is required.'
      : existing.includes(trimmed)
        ? 'That user already exists.'
        : null;
  const passwordError =
    password === ''
      ? 'Password is required.'
      : password !== confirm
        ? 'Passwords do not match.'
        : null;
  const valid = !nameError && !passwordError;

  const submit = async () => {
    setError(null);
    try {
      await onAdd(trimmed, password, role);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <UserPlus />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add UI user</DialogTitle>
          <DialogDescription>
            Creates a login for the artist UI. The password is hashed (scrypt) and never stored or
            shown in plain text.
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4 px-6 py-2'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='wg-username'>Username</Label>
            <Input
              id='wg-username'
              autoFocus
              autoComplete='off'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {username !== '' && nameError && (
              <span className='text-destructive text-xs'>{nameError}</span>
            )}
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='wg-password'>Password</Label>
            <Input
              id='wg-password'
              type='password'
              autoComplete='new-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='wg-confirm'>Confirm password</Label>
            <Input
              id='wg-confirm'
              type='password'
              autoComplete='new-password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm !== '' && passwordError && (
              <span className='text-destructive text-xs'>{passwordError}</span>
            )}
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='wg-role'>Role</Label>
            <select
              id='wg-role'
              className={ROLE_STYLE}
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value='operator'>operator — use show controls</option>
              <option value='admin'>admin — manage users, roles &amp; sessions</option>
            </select>
          </div>
          {error && <span className='text-destructive text-sm'>{error}</span>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !valid}>
            Add user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab({
  users,
  onAdd,
  onRemove,
  onSetRole,
  busy
}: {
  users: UserAccount[];
  onAdd: (username: string, password: string, role: UserRole) => Promise<void>;
  onRemove: (username: string) => void;
  onSetRole: (username: string, role: UserRole) => void;
  busy: boolean;
}) {
  const names = users.map((u) => u.username);

  return (
    <div className='flex flex-col gap-3 pt-4'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {users.length} UI login{users.length === 1 ? '' : 's'}
        </span>
        <AddUserDialog existing={names} onAdd={onAdd} busy={busy} />
      </div>
      {users.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Users />
            </EmptyMedia>
            <EmptyTitle>No users yet</EmptyTitle>
            <EmptyDescription>Add a login so the artist UI can be signed into.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead className='w-56'>Role</TableHead>
              <TableHead className='w-16' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const demoteBlock = roleChangeBlock(users, u, 'operator');
              const removeBlock = userRemovalBlock(users, u);
              return (
                <TableRow key={u.username}>
                  <TableCell className='font-medium'>{u.username}</TableCell>
                  <TableCell>
                    <select
                      className={ROLE_STYLE}
                      value={u.role}
                      disabled={busy || demoteBlock !== null}
                      title={demoteBlock ?? undefined}
                      onChange={(e) => onSetRole(u.username, e.target.value as UserRole)}
                    >
                      <option value='operator'>operator</option>
                      <option value='admin'>admin</option>
                    </select>
                  </TableCell>
                  <TableCell className='text-right'>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={busy || removeBlock !== null}
                          title={removeBlock ?? 'Remove user'}
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove “{u.username}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This user will no longer be able to sign into the UI, and any active
                            session of theirs is revoked.
                            {users.length === 1 && (
                              <>
                                {' '}
                                This is the last account — nobody will be able to sign in until you
                                add another.
                              </>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onRemove(u.username)}
                            className='bg-destructive text-white hover:bg-destructive/90'
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function SessionsTab({
  sessions,
  onRevoke,
  onRefresh,
  busy
}: {
  sessions: SessionInfo[];
  onRevoke: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <div className='flex flex-col gap-3 pt-4'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {sessions.length} active session{sessions.length === 1 ? '' : 's'}
        </span>
        <Button variant='outline' size='sm' disabled={busy} onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      {sessions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <MonitorSmartphone />
            </EmptyMedia>
            <EmptyTitle>Nobody logged in</EmptyTitle>
            <EmptyDescription>
              A session appears here whenever someone signs into the UI while the brain is running.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className='w-16' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className='font-medium'>{s.username}</TableCell>
                <TableCell>
                  <Badge variant={s.role === 'admin' ? 'default' : 'secondary'}>{s.role}</Badge>
                </TableCell>
                <TableCell className='font-mono text-xs'>{s.ip}</TableCell>
                <TableCell className='text-muted-foreground text-sm'>{relativeTime(s.lastSeen)}</TableCell>
                <TableCell className='text-right'>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={busy}
                    title='Revoke session'
                    onClick={() => onRevoke(s.id)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <span className='text-muted-foreground text-xs'>
        Revoking takes effect on the client's next token refresh — open sockets aren't force-closed.
      </span>
    </div>
  );
}

/** Name a new key and pick the role it grants. */
function MintKeyDialog({
  existing,
  onMint,
  busy
}: {
  existing: string[];
  onMint: (name: string, role: UserRole) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('operator');

  const wellFormed = /^[a-z0-9][a-z0-9-]{0,30}$/.test(name);
  const duplicate = existing.includes(name);
  const valid = wellFormed && !duplicate;

  const submit = async () => {
    if (!valid) return;
    await onMint(name, role);
    setName('');
    setRole('operator');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm' disabled={busy}>
          <Ticket />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint an access key</DialogTitle>
          <DialogDescription>
            Name it after whoever holds it — a person (“dan-ipad”) or a group (“friday-guests”). The
            passphrase is generated here and shown once.
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-3 px-6 py-2'>
          <Input
            autoFocus
            placeholder='friday-guests'
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
          />
          <select
            className={ROLE_STYLE}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value='operator'>operator — drive the show</option>
            <option value='admin'>admin — also manage access</option>
          </select>
          {name && !wellFormed && (
            <span className='text-destructive text-xs'>
              Lowercase letters, numbers and dashes only.
            </span>
          )}
          {duplicate && (
            <span className='text-destructive text-xs'>
              “{name}” already exists — minting it again would replace its passphrase.
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !valid}>
            Mint key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeysTab({
  keys,
  onMint,
  onSetEnabled,
  onSetRole,
  onRemove,
  onRemoveAll,
  busy
}: {
  keys: AccessKeyInfo[];
  onMint: (name: string, role: UserRole) => Promise<string>;
  onSetEnabled: (name: string, enabled: boolean) => void;
  onSetRole: (name: string, role: UserRole) => void;
  onRemove: (name: string) => void;
  onRemoveAll: () => void;
  busy: boolean;
}) {
  // The freshly-minted passphrase, held only in this component to reveal once.
  const [revealed, setRevealed] = React.useState<{ name: string; passphrase: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const mint = async (name: string, role: UserRole) => {
    const passphrase = await onMint(name, role);
    if (passphrase) {
      setRevealed({ name, passphrase });
      setCopied(false);
    }
  };

  const copy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.passphrase);
    setCopied(true);
  };

  return (
    <div className='flex flex-col gap-3 pt-4'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {keys.length} access key{keys.length === 1 ? '' : 's'}
        </span>
        <div className='flex items-center gap-2'>
          {keys.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='outline' size='sm' className='text-destructive' disabled={busy}>
                  <Trash2 />
                  Revoke all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke all {keys.length} keys?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every key is deleted and its holders lose access on their next refresh. Personal
                    admin/operator logins are unaffected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onRemoveAll}
                    className='bg-destructive text-white hover:bg-destructive/90'
                  >
                    Revoke all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <MintKeyDialog existing={keys.map((k) => k.name)} onMint={mint} busy={busy} />
        </div>
      </div>

      {keys.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Ticket />
            </EmptyMedia>
            <EmptyTitle>No access keys</EmptyTitle>
            <EmptyDescription>
              Mint a key to let someone in without their own account — one per person, or one shared
              with a crowd. Keys default to <strong>operator</strong>: drive the show, but no access
              management. Revoke any single key without disturbing the others.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead className='w-48'>Role</TableHead>
              <TableHead className='w-28'>State</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className='w-28' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.name} className={k.enabled ? undefined : 'opacity-60'}>
                <TableCell className='font-medium'>{k.name}</TableCell>
                <TableCell>
                  <select
                    className={ROLE_STYLE}
                    value={k.role}
                    disabled={busy}
                    onChange={(e) => onSetRole(k.name, e.target.value as UserRole)}
                  >
                    <option value='operator'>operator</option>
                    <option value='admin'>admin</option>
                  </select>
                </TableCell>
                <TableCell>
                  <Badge variant={k.enabled ? 'default' : 'secondary'}>
                    {k.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground text-sm'>
                  {k.lastUsedAt ? relativeTime(k.lastUsedAt) : 'never'}
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={busy}
                    title={k.enabled ? 'Disable key' : 'Enable key'}
                    onClick={() => onSetEnabled(k.name, !k.enabled)}
                  >
                    {k.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant='ghost' size='sm' disabled={busy} title='Revoke key'>
                        <Trash2 />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke “{k.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The passphrase stops working and any session opened with it is revoked.
                          Other keys are unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRemove(k.name)}
                          className='bg-destructive text-white hover:bg-destructive/90'
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <span className='text-muted-foreground text-xs'>
        Keys are stored only as hashes — a passphrase can’t be shown again, so a forgotten one is
        re-minted, not recovered. Disabling or revoking takes effect on the holder’s next token
        refresh; open sockets aren’t force-closed.
      </span>

      <Dialog open={revealed !== null} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share “{revealed?.name}”</DialogTitle>
            <DialogDescription>
              Copy it now — it won’t be shown again. Anyone with this passphrase signs in as{' '}
              {revealed?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className='flex items-center gap-2 px-6 py-2'>
            <code className='bg-muted flex-1 rounded-md px-3 py-2 font-mono text-lg tracking-wide'>
              {revealed?.passphrase}
            </code>
            <Button variant='outline' size='sm' onClick={() => void copy()}>
              <Copy />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecretsTab({
  secrets,
  onGenerate,
  busy
}: {
  secrets: RequiredSecretInfo[];
  onGenerate: (force: boolean) => void;
  busy: boolean;
}) {
  const missing = secrets.filter((s) => !s.set).length;

  return (
    <div className='flex flex-col gap-3 pt-4'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {missing === 0 ? 'All required secrets set' : `${missing} secret(s) missing`}
        </span>
        <div className='flex items-center gap-2'>
          {missing > 0 && (
            <Button size='sm' disabled={busy} onClick={() => onGenerate(false)}>
              <KeyRound />
              Generate missing
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='outline' size='sm' disabled={busy}>
                <RefreshCw />
                Rotate all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate all secrets?</AlertDialogTitle>
                <AlertDialogDescription>
                  This regenerates every secret. Receivers using the old <code>receiverKey</code>{' '}
                  and any live UI sessions will need to reconnect / sign in again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onGenerate(true)}>Rotate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Secret</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className='w-24'>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.map((s) => (
            <TableRow key={s.name}>
              <TableCell className='font-mono text-sm'>{s.name}</TableCell>
              <TableCell className='text-muted-foreground text-sm'>{s.description}</TableCell>
              <TableCell>
                {s.set ? (
                  <Badge>set</Badge>
                ) : (
                  <Badge variant='destructive'>missing</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className='text-muted-foreground text-xs'>
        Secret values are never shown or sent to this window — only whether each is set.
      </span>
    </div>
  );
}

interface AccessRouteProps {
  project: string | null;
  users: UserAccount[];
  sessions: SessionInfo[];
  secrets: RequiredSecretInfo[];
  keys: AccessKeyInfo[];
  onAddUser: (username: string, password: string, role: UserRole) => Promise<void>;
  onRemoveUser: (username: string) => void;
  onSetUserRole: (username: string, role: UserRole) => void;
  onRevokeSession: (id: string) => void;
  onRefreshSessions: () => void;
  onMintKey: (name: string, role: UserRole) => Promise<string>;
  onSetKeyEnabled: (name: string, enabled: boolean) => void;
  onSetKeyRole: (name: string, role: UserRole) => void;
  onRemoveKey: (name: string) => void;
  onRemoveAllKeys: () => void;
  onGenerateSecrets: (force: boolean) => void;
  busy: boolean;
}

/** Access admin for one project: UI logins + their roles (admin/operator), the
 *  live login sessions an admin can revoke, and secret set/missing status. All
 *  write through the shared store — no secret values or password hashes ever
 *  cross IPC. This is the local privileged path (Electron main owns the store);
 *  a remote Electron uses the server's role-gated /api/admin endpoints instead. */
export function AccessRoute({
  project,
  users,
  sessions,
  secrets,
  keys,
  onAddUser,
  onRemoveUser,
  onSetUserRole,
  onRevokeSession,
  onRefreshSessions,
  onMintKey,
  onSetKeyEnabled,
  onSetKeyRole,
  onRemoveKey,
  onRemoveAllKeys,
  onGenerateSecrets,
  busy
}: AccessRouteProps) {
  if (!project) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>No project selected</EmptyTitle>
            <EmptyDescription>
              Pick a project on the Projects screen to manage its users and secrets.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4 p-4'>
      <span className='font-medium'>{project}</span>
      <Tabs defaultValue='users'>
        <TabsList>
          <TabsTrigger value='users'>Users</TabsTrigger>
          <TabsTrigger value='sessions'>Sessions</TabsTrigger>
          <TabsTrigger value='keys'>Access keys</TabsTrigger>
          <TabsTrigger value='secrets'>Secrets</TabsTrigger>
        </TabsList>
        <TabsContent value='users'>
          <UsersTab
            users={users}
            onAdd={onAddUser}
            onRemove={onRemoveUser}
            onSetRole={onSetUserRole}
            busy={busy}
          />
        </TabsContent>
        <TabsContent value='sessions'>
          <SessionsTab
            sessions={sessions}
            onRevoke={onRevokeSession}
            onRefresh={onRefreshSessions}
            busy={busy}
          />
        </TabsContent>
        <TabsContent value='keys'>
          <KeysTab
            keys={keys}
            onMint={onMintKey}
            onSetEnabled={onSetKeyEnabled}
            onSetRole={onSetKeyRole}
            onRemove={onRemoveKey}
            onRemoveAll={onRemoveAllKeys}
            busy={busy}
          />
        </TabsContent>
        <TabsContent value='secrets'>
          <SecretsTab secrets={secrets} onGenerate={onGenerateSecrets} busy={busy} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
