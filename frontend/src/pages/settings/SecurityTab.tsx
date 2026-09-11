import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  message,
} from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ClipboardManager, HttpUtil, IntlUtil, RandomUtil } from '@/utils';
import type { AllSetting } from '@/models/setting';
import { SettingListItem } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { catTabLabel } from './catTabLabel';
import TwoFactorModal from './TwoFactorModal';
import './SecurityTab.css';

interface ApiMsg<T = unknown> {
  success?: boolean;
  msg?: string;
  obj?: T;
}

interface ApiTokenRow {
  id: number;
  name: string;
  enabled: boolean;
  createdAt: number;
  scope: 'admin' | 'monitor' | 'node-sync';
  expiresAt: number;
}

interface AdminUser {
  id: number;
  username: string;
  role: string;
  permissions: string;
}

interface SecurityTabProps {
  allSetting: AllSetting;
  updateSetting: (patch: Partial<AllSetting>) => void;
  saveSetting: (payload: Partial<AllSetting> & Record<string, unknown>) => Promise<unknown>;
}

const UNIX_MILLISECONDS_THRESHOLD = 100_000_000_000;

function apiTokenCreatedAtMilliseconds(createdAt: number): number {
  return createdAt < UNIX_MILLISECONDS_THRESHOLD ? createdAt * 1000 : createdAt;
}

type TfaType = 'set' | 'confirm';

interface TfaState {
  open: boolean;
  title: string;
  description: string;
  token: string;
  type: TfaType;
  onConfirm: (success: boolean, code?: string) => void;
}

const TFA_INITIAL: TfaState = {
  open: false,
  title: '',
  description: '',
  token: '',
  type: 'set',
  onConfirm: () => {},
};

export default function SecurityTab({ allSetting, updateSetting, saveSetting }: SecurityTabProps) {
  const { t } = useTranslation();
  const { isMobile } = useMediaQuery();
  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  const [tfa, setTfa] = useState<TfaState>(TFA_INITIAL);
  const [user, setUser] = useState({
    oldUsername: '',
    oldPassword: '',
    newUsername: '',
    newPassword: '',
  });
  const [updating, setUpdating] = useState(false);

  const [apiTokens, setApiTokens] = useState<ApiTokenRow[]>([]);
  const [apiTokensLoading, setApiTokensLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);

  // Admin users state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Operator' });
  const [permissionFlags, setPermissionFlags] = useState<string[]>([
    'inbounds.read',
    'clients.read',
  ]);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    password: '',
    role: 'Operator',
    permissions: '',
  });
  const [editOpen, setEditOpen] = useState(false);

  const openTfa = useCallback((opts: Omit<TfaState, 'open'>) => {
    setTfa({ ...opts, open: true });
  }, []);

  const onTfaConfirm = useCallback(
    (success: boolean, code?: string) => {
      tfa.onConfirm(success, code);
    },
    [tfa],
  );

  function updateUserField<K extends keyof typeof user>(key: K, value: string) {
    setUser((prev) => ({ ...prev, [key]: value }));
  }

  const sendUpdateUser = useCallback(
    async (twoFactorCode = '') => {
      setUpdating(true);
      try {
        const msg = (await HttpUtil.post('/panel/api/setting/updateUser', {
          ...user,
          twoFactorCode,
        })) as ApiMsg;
        if (msg?.success) {
          await HttpUtil.post('/logout');
          const basePath = window.X_UI_BASE_PATH || '/';
          window.location.replace(basePath);
        }
      } finally {
        setUpdating(false);
      }
    },
    [user],
  );

  function onUpdateUserClick() {
    if (allSetting.twoFactorEnable) {
      openTfa({
        title: t('pages.settings.security.twoFactorModalChangeCredentialsTitle'),
        description: t('pages.settings.security.twoFactorModalChangeCredentialsStep'),
        token: '',
        type: 'confirm',
        onConfirm: (ok: boolean, code?: string) => {
          if (ok) sendUpdateUser(code || '');
        },
      });
    } else {
      sendUpdateUser();
    }
  }

  const fetchApiTokens = useCallback(async () => {
    try {
      const msg = (await HttpUtil.get('/panel/api/setting/apiTokens')) as ApiMsg<ApiTokenRow[]>;
      if (msg?.success) setApiTokens(Array.isArray(msg.obj) ? msg.obj : []);
    } finally {
      setApiTokensLoading(false);
    }
  }, []);

  const loadApiTokens = useCallback(async () => {
    setApiTokensLoading(true);
    await fetchApiTokens();
  }, [fetchApiTokens]);

  useEffect(() => {
    void fetchApiTokens();
  }, [fetchApiTokens]);

  async function copyToken(token: string) {
    if (!token) return;
    const ok = await ClipboardManager.copyText(token);
    if (ok) messageApi.success(t('copySuccess'));
    else messageApi.error(t('copyFail') ?? 'Copy failed');
  }

  function openCreateModal() {
    setCreateName('');
    setCreateOpen(true);
  }

  async function confirmCreateToken() {
    const name = createName.trim();
    if (!name) {
      messageApi.error(t('pages.settings.security.apiTokenNameRequired') || 'Name is required');
      return;
    }
    setCreating(true);
    try {
      const msg = (await HttpUtil.post('/panel/api/setting/apiTokens/create', { name })) as ApiMsg<{
        token?: string;
      }>;
      if (msg?.success) {
        setCreateOpen(false);
        await loadApiTokens();
        if (msg.obj?.token) {
          setCreatedToken({ name, token: msg.obj.token });
        }
      }
    } finally {
      setCreating(false);
    }
  }

  function confirmDeleteToken(row: ApiTokenRow) {
    modal.confirm({
      title: `${t('delete')} "${row.name}"?`,
      content:
        t('pages.settings.security.apiTokenDeleteWarning') ||
        'Any caller using this token will stop authenticating immediately.',
      okText: t('delete'),
      cancelText: t('cancel'),
      okType: 'danger',
      onOk: async () => {
        const msg = (await HttpUtil.post(`/panel/api/setting/apiTokens/delete/${row.id}`, {
          expectedScope: row.scope,
        })) as ApiMsg;
        if (msg?.success) await loadApiTokens();
      },
    });
  }

  async function toggleTokenEnabled(row: ApiTokenRow) {
    const target = !row.enabled;
    const msg = (await HttpUtil.post(`/panel/api/setting/apiTokens/setEnabled/${row.id}`, {
      enabled: target,
      expectedScope: row.scope,
    })) as ApiMsg;
    if (msg?.success) {
      setApiTokens((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: target } : r)));
    }
  }

  function formatTokenDate(ts: number): string {
    if (!ts) return '';
    return IntlUtil.formatDate(apiTokenCreatedAtMilliseconds(ts));
  }

  function toggleTwoFactor() {
    if (!allSetting.twoFactorEnable) {
      const newToken = RandomUtil.randomBase32String();
      openTfa({
        title: t('pages.settings.security.twoFactorModalSetTitle'),
        description: '',
        token: newToken,
        type: 'set',
        onConfirm: (ok: boolean) => {
          if (ok) {
            messageApi.success(t('pages.settings.security.twoFactorModalSetSuccess'));
            updateSetting({ twoFactorToken: newToken, twoFactorEnable: true });
          } else {
            updateSetting({ twoFactorEnable: false });
          }
        },
      });
    } else {
      openTfa({
        title: t('pages.settings.security.twoFactorModalDeleteTitle'),
        description: t('pages.settings.security.twoFactorModalRemoveStep'),
        token: '',
        type: 'confirm',
        onConfirm: async (ok: boolean, code?: string) => {
          if (!ok) return;
          const next = {
            ...allSetting,
            twoFactorEnable: false,
            twoFactorToken: '',
            twoFactorCode: code || '',
          };
          const msg = (await saveSetting(next)) as ApiMsg;
          if (msg?.success) {
            messageApi.success(t('pages.settings.security.twoFactorModalDeleteSuccess'));
            updateSetting({ twoFactorEnable: false, twoFactorToken: '', hasTwoFactorToken: false });
          }
        },
      });
    }
  }

  const fetchAdminUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const msg = (await HttpUtil.get('/panel/api/setting/users')) as ApiMsg<AdminUser[]>;
      if (msg?.success) setAdminUsers(Array.isArray(msg.obj) ? msg.obj : []);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdminUsers();
  }, [fetchAdminUsers]);

  async function addAdminUser() {
    const username = newUser.username.trim();
    if (!username) {
      messageApi.error('Username is required');
      return;
    }
    if (!newUser.password) {
      messageApi.error('Password is required');
      return;
    }
    const msg = (await HttpUtil.post('/panel/api/setting/users/create', {
      username,
      password: newUser.password,
      role: newUser.role,
      permissions: permissionFlags.join(','),
    })) as ApiMsg;
    if (msg?.success) {
      setNewUser({ username: '', password: '', role: 'Operator' });
      setPermissionFlags(['inbounds.read', 'clients.read']);
      await fetchAdminUsers();
    } else {
      messageApi.error(msg?.msg ?? 'Failed to create user');
    }
  }

  function openEditUser(u: AdminUser) {
    setEditUser(u);
    setEditForm({
      username: u.username,
      password: '',
      role: u.role,
      permissions: u.permissions,
    });
    setEditOpen(true);
  }

  async function confirmEditUser() {
    if (!editUser) return;
    const msg = (await HttpUtil.post(`/panel/api/setting/users/update/${editUser.id}`, {
      username: editForm.username.trim(),
      password: editForm.password,
      role: editForm.role,
      permissions: editForm.permissions,
    })) as ApiMsg;
    if (msg?.success) {
      setEditOpen(false);
      setEditUser(null);
      await fetchAdminUsers();
    } else {
      messageApi.error(msg?.msg ?? 'Failed to update user');
    }
  }

  function confirmDeleteUser(u: AdminUser) {
    modal.confirm({
      title: `Delete "${u.username}"?`,
      content: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
      okType: 'danger',
      onOk: async () => {
        const msg = (await HttpUtil.post(`/panel/api/setting/users/delete/${u.id}`, {})) as ApiMsg;
        if (msg?.success) {
          await fetchAdminUsers();
        } else {
          messageApi.error(msg?.msg ?? 'Failed to delete user');
        }
      },
    });
  }

  return (
    <>
      {messageContextHolder}
      {modalContextHolder}
      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: '1',
            label: catTabLabel(<UserOutlined />, t('pages.settings.security.admin'), isMobile),
            children: (
              <>
                <SettingListItem paddings="small" title={t('pages.settings.oldUsername')}>
                  <Input
                    value={user.oldUsername}
                    autoComplete="username"
                    onChange={(e) => updateUserField('oldUsername', e.target.value)}
                  />
                </SettingListItem>
                <SettingListItem paddings="small" title={t('pages.settings.currentPassword')}>
                  <Input.Password
                    value={user.oldPassword}
                    autoComplete="current-password"
                    onChange={(e) => updateUserField('oldPassword', e.target.value)}
                  />
                </SettingListItem>
                <SettingListItem paddings="small" title={t('pages.settings.newUsername')}>
                  <Input
                    value={user.newUsername}
                    onChange={(e) => updateUserField('newUsername', e.target.value)}
                  />
                </SettingListItem>
                <SettingListItem paddings="small" title={t('pages.settings.newPassword')}>
                  <Input.Password
                    value={user.newPassword}
                    autoComplete="new-password"
                    onChange={(e) => updateUserField('newPassword', e.target.value)}
                  />
                </SettingListItem>
                <div className="security-actions">
                  <Space style={{ padding: '0 20px' }}>
                    <Button type="primary" loading={updating} onClick={onUpdateUserClick}>
                      {t('confirm')}
                    </Button>
                  </Space>
                </div>
              </>
            ),
          },
          {
            key: '2',
            label: catTabLabel(
              <SafetyOutlined />,
              t('pages.settings.security.twoFactor'),
              isMobile,
            ),
            children: (
              <SettingListItem
                paddings="small"
                title={t('pages.settings.security.twoFactorEnable')}
                description={t('pages.settings.security.twoFactorEnableDesc')}
              >
                <Switch checked={allSetting.twoFactorEnable} onClick={toggleTwoFactor} />
              </SettingListItem>
            ),
          },
          {
            key: '3',
            label: catTabLabel(<ApiOutlined />, t('pages.nodes.apiToken'), isMobile),
            children: (
              <div className="api-token-section">
                <div className="api-token-header">
                  <p className="api-token-hint">{t('pages.nodes.apiTokenHint')}</p>
                  <Button type="primary" size="small" onClick={openCreateModal}>
                    + {t('pages.settings.security.apiTokenNew') || 'New token'}
                  </Button>
                </div>
                <Spin spinning={apiTokensLoading}>
                  {!apiTokens.length && !apiTokensLoading && (
                    <Empty
                      description={t('pages.settings.security.apiTokenEmpty') || 'No tokens yet'}
                    />
                  )}
                  {apiTokens.map((row) => (
                    <div key={row.id} className={`api-token-row${row.enabled ? '' : ' disabled'}`}>
                      <div className="api-token-row-head">
                        <div className="api-token-name-wrap">
                          <span className="api-token-name">{row.name}</span>
                          <span className="api-token-created">
                            {formatTokenDate(row.createdAt)}
                          </span>
                        </div>
                        <div className="api-token-actions">
                          <Switch
                            size="small"
                            checked={row.enabled}
                            onChange={() => toggleTokenEnabled(row)}
                          />
                          <Button
                            size="small"
                            danger
                            type="text"
                            onClick={() => confirmDeleteToken(row)}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </Spin>
              </div>
            ),
          },
          {
            key: '4',
            label: catTabLabel(<TeamOutlined />, 'Users', isMobile),
            children: (
              <div className="admin-management-section">
                <div className="admin-management-head">
                  <div className="admin-management-title">
                    <span className="admin-management-kicker">Users</span>
                    <span className="admin-management-copy">
                      Create a user, assign role, and apply permission flags.
                    </span>
                  </div>
                </div>

                <div className="admin-add-user-form">
                  <Input
                    placeholder="username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    size="small"
                    style={{ width: 150 }}
                  />
                  <Input.Password
                    placeholder="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    size="small"
                    style={{ width: 150 }}
                  />
                  <Select
                    size="small"
                    style={{ width: 120 }}
                    value={newUser.role}
                    onChange={(v) => setNewUser({ ...newUser, role: String(v) })}
                    options={[
                      { value: 'Owner', label: 'Owner' },
                      { value: 'Operator', label: 'Operator' },
                      { value: 'Auditor', label: 'Auditor' },
                    ]}
                  />
                </div>

                <div className="permission-flag-row">
                  <span className="permission-flag-label">Permission flags</span>
                  <Checkbox.Group
                    options={[
                      { label: 'inbounds.read', value: 'inbounds.read' },
                      { label: 'inbounds.write', value: 'inbounds.write' },
                      { label: 'clients.read', value: 'clients.read' },
                      { label: 'clients.write', value: 'clients.write' },
                      { label: 'settings.write', value: 'settings.write' },
                      { label: 'routes.read', value: 'routes.read' },
                    ]}
                    value={permissionFlags}
                    onChange={(v) => setPermissionFlags(v.map(String))}
                  />
                </div>

                <div className="admin-add-user-submit">
                  <Button type="primary" size="small" onClick={addAdminUser}>
                    Add user
                  </Button>
                </div>

                <Spin spinning={usersLoading}>
                  {!adminUsers.length && !usersLoading && (
                    <Empty description="No users" />
                  )}
                  <div className="admin-management-grid">
                    {adminUsers.map((u) => {
                      const perms = u.permissions
                        ? u.permissions.split(',').filter(Boolean)
                        : [];
                      return (
                        <div className="admin-user-card" key={u.id}>
                          <div className="admin-user-card-head">
                            <div>
                              <span className="admin-user-name">{u.username}</span>
                              <span className="admin-user-role">{u.role}</span>
                            </div>
                            <div className="admin-user-card-actions">
                              <Button
                                size="small"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => openEditUser(u)}
                              />
                              <Button
                                size="small"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => confirmDeleteUser(u)}
                              />
                            </div>
                          </div>
                          <div className="admin-user-permissions">
                            {perms.map((permission) => (
                              <span className="admin-permission-chip" key={permission}>
                                {permission}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Spin>
              </div>
            ),
          },
        ]}
      />

      {/* Edit user modal */}
      <Modal
        open={editOpen}
        title={`Edit user: ${editUser?.username ?? ''}`}
        okText="Save"
        cancelText="Cancel"
        onOk={confirmEditUser}
        onCancel={() => {
          setEditOpen(false);
          setEditUser(null);
        }}
      >
        <Form layout="vertical">
          <Form.Item label="Username" required>
            <Input
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="New password (leave blank to keep current)">
            <Input.Password
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item label="Role">
            <Select
              value={editForm.role}
              onChange={(v) => setEditForm({ ...editForm, role: String(v) })}
              options={[
                { value: 'Owner', label: 'Owner' },
                { value: 'Operator', label: 'Operator' },
                { value: 'Auditor', label: 'Auditor' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Permission flags">
            <Checkbox.Group
              options={[
                { label: 'inbounds.read', value: 'inbounds.read' },
                { label: 'inbounds.write', value: 'inbounds.write' },
                { label: 'clients.read', value: 'clients.read' },
                { label: 'clients.write', value: 'clients.write' },
                { label: 'settings.write', value: 'settings.write' },
                { label: 'routes.read', value: 'routes.read' },
              ]}
              value={editForm.permissions ? editForm.permissions.split(',').filter(Boolean) : []}
              onChange={(v) => setEditForm({ ...editForm, permissions: v.join(',') })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={createOpen}
        title={t('pages.settings.security.apiTokenNew') || 'New API token'}
        confirmLoading={creating}
        okText={t('confirm')}
        cancelText={t('cancel')}
        onOk={confirmCreateToken}
        onCancel={() => setCreateOpen(false)}
      >
        <Form layout="vertical">
          <Form.Item label={t('pages.settings.security.apiTokenName') || 'Name'} required>
            <Input
              value={createName}
              maxLength={64}
              placeholder={
                t('pages.settings.security.apiTokenNamePlaceholder') || 'e.g. central-panel-a'
              }
              onChange={(e) => setCreateName(e.target.value)}
              onPressEnter={confirmCreateToken}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!createdToken}
        title={t('pages.settings.security.apiTokenCreatedTitle') || 'Token created'}
        okText={t('done')}
        onOk={() => setCreatedToken(null)}
        onCancel={() => setCreatedToken(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <p className="api-token-created-notice">
          {t('pages.settings.security.apiTokenCreatedNotice') ||
            'Copy this token now. For security it is not stored in readable form and will not be shown again.'}
        </p>
        <div className="api-token-value-wrap">
          <code className="api-token-value">{createdToken?.token}</code>
          <Button
            size="small"
            type="primary"
            onClick={() => createdToken && copyToken(createdToken.token)}
          >
            {t('copy')}
          </Button>
        </div>
      </Modal>

      <TwoFactorModal
        open={tfa.open}
        title={tfa.title}
        description={tfa.description}
        token={tfa.token}
        type={tfa.type}
        onConfirm={onTfaConfirm}
        onOpenChange={(open) => setTfa((prev) => ({ ...prev, open }))}
      />
    </>
  );
}
