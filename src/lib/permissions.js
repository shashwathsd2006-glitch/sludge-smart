const ALL_PERMISSIONS = [
  'generation:read', 'generation:write', 'generation:delete',
  'lab:read', 'lab:write', 'lab:delete',
  'handling:read', 'handling:write', 'handling:delete',
  'disposal:read', 'disposal:write', 'disposal:delete',
  'compliance:read', 'compliance:write', 'compliance:delete',
  'technology:read', 'technology:write',
  'reports:read', 'audit:read', 'users:read', 'users:write',
];

const ROLE_PERMISSIONS = {
  administrator: new Set(ALL_PERMISSIONS),
  operator: new Set([
    'generation:read', 'generation:write', 'generation:delete',
    'lab:read',
    'handling:read', 'handling:write', 'handling:delete',
    'disposal:read', 'disposal:write', 'disposal:delete',
    'compliance:read', 'technology:read', 'reports:read',
  ]),
  laboratory: new Set([
    'generation:read',
    'lab:read', 'lab:write', 'lab:delete',
    'handling:read', 'disposal:read', 'compliance:read',
    'technology:read', 'reports:read',
  ]),
  ehs_reviewer: new Set([
    'generation:read', 'lab:read', 'handling:read', 'disposal:read',
    'compliance:read', 'compliance:write', 'technology:read',
    'reports:read', 'audit:read',
  ]),
};

export function can(user, permission) {
  if (!user) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes(permission)) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.length === 0) return false;
  return roles.some((role) => (
    role === 'administrator' || Boolean(ROLE_PERMISSIONS[role]?.has(permission))
  ));
}

export function isAdmin(user) {
  return Boolean(user?.roles?.includes('administrator'));
}

export function rolesLabel(user) {
  if (!user?.roles?.length) return 'DEMO USER';
  return user.roles
    .map((role) => role.replace(/_/g, ' ').toUpperCase())
    .join(' / ');
}
