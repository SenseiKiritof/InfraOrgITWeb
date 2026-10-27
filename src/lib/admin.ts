import { apiFetch } from "./api";
import type { Paged } from "./inventory";
import { paged } from "./inventory";

export interface UserRef {
  id: number;
  name: string;
}

export interface UserRoleRef {
  id: number;
  name: string;
  label: string;
  scopeEnum: "System" | "Environment";
}

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  surname: string;
  groups: UserRef[];
  roles: UserRoleRef[];
}

export interface AdminGroup {
  id: number;
  name: string;
  usersCount: number;
}

export interface AdminRole {
  id: number;
  name: string;
  label: string;
  scopeEnum: "System" | "Environment";
  usersCount: number;
  menusCount: number;
  assignmentsCount: number;
}

export interface AdminMenu {
  id: number;
  name: string;
  path: string;
  isActive: boolean;
  hideBackButton: boolean;
  isVisible: boolean;
  order: number | null;
  parentId: number | null;
  roleIds: number[];
}

export interface EnvironmentGroupRole {
  id: number;
  providerEnvironmentId: number;
  groupId: number;
  groupName: string;
  roleId: number;
  roleName: string;
}

export function getUsers(q?: string): Promise<Paged<AdminUser>> {
  return paged<AdminUser>("/api/users", q);
}

export function getGroups(): Promise<Paged<AdminGroup>> {
  return paged<AdminGroup>("/api/groups");
}

export function getRoles(): Promise<Paged<AdminRole>> {
  return paged<AdminRole>("/api/roles");
}

export function getAdminMenus(): Promise<AdminMenu[]> {
  return apiFetch<AdminMenu[]>("/api/menus/all");
}

export function getEnvironmentGroupRoles(
  providerEnvironmentId: number,
): Promise<Paged<EnvironmentGroupRole>> {
  return apiFetch<Paged<EnvironmentGroupRole>>(
    `/api/provider-environments/${providerEnvironmentId}/group-roles?pageSize=200`,
  );
}
