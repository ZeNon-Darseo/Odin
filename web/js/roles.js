export const STAFF_ROLES = ['admin', 'owner'];
export const ROLES = ['client', 'admin', 'owner'];
export const ASSIGNABLE_ROLES = ['client', 'admin'];

export const isStaff = (user) => Boolean(user) && STAFF_ROLES.includes(user.role);
export const isOwner = (user) => user?.role === 'owner';
export const isAdmin = (user) => user?.role === 'admin';
