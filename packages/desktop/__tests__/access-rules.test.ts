import { roleChangeBlock, userRemovalBlock } from '@/renderer/lib/access-rules';
import type { UserAccount } from '@/types/ipc';

const admin = (username: string): UserAccount => ({ username, role: 'admin' });
const operator = (username: string): UserAccount => ({ username, role: 'operator' });

describe('userRemovalBlock', () => {
  it('allows removing the only account, admin or not', () => {
    expect(userRemovalBlock([admin('dan')], admin('dan'))).toBeNull();
    expect(userRemovalBlock([operator('dan')], operator('dan'))).toBeNull();
  });

  it('refuses to remove the only admin while other users remain', () => {
    const users = [admin('dan'), operator('crew')];
    expect(userRemovalBlock(users, admin('dan'))).toMatch(/last admin/i);
  });

  it('allows removing an operator, and an admin when another admin remains', () => {
    const users = [admin('dan'), admin('sam'), operator('crew')];
    expect(userRemovalBlock(users, operator('crew'))).toBeNull();
    expect(userRemovalBlock(users, admin('dan'))).toBeNull();
  });
});

describe('roleChangeBlock', () => {
  it('refuses to demote the last admin even when they are the only account', () => {
    expect(roleChangeBlock([admin('dan')], admin('dan'), 'operator')).toMatch(/demoted/i);
  });

  it('allows promotion and demotion while another admin remains', () => {
    const users = [admin('dan'), admin('sam')];
    expect(roleChangeBlock(users, admin('dan'), 'operator')).toBeNull();
    expect(roleChangeBlock(users, operator('crew'), 'admin')).toBeNull();
  });
});
