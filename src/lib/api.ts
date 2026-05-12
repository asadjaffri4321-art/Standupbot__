// API client for StandupBot backend

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: any
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include", // Important for cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, response.statusText, data);
  }

  return response.json();
}

// Auth
export const auth = {
  getMe: () => fetchApi<User>("/api/me"),
  logout: () =>
    fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }),
  loginUrl: () => `${API_BASE}/auth/google`,
};

// Projects
export const projects = {
  list: () => fetchApi<ProjectWithStatus[]>("/api/projects"),
  create: (data: ProjectCreate) =>
    fetchApi<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  get: (id: string) => fetchApi<ProjectDetail>(`/api/projects/${id}`),
  getBriefToday: (id: string) =>
    fetchApi<Brief>(`/api/projects/${id}/brief/today`),
  generateBrief: (id: string) => `${API_BASE}/api/projects/${id}/brief`, // SSE endpoint
};

// Members
export const members = {
  addByEmail: (projectId: string, data: MemberInvite) =>
    fetchApi(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listInviteLinks: (projectId: string) =>
    fetchApi<InviteLink[]>(`/api/projects/${projectId}/invite-links`),
  createInviteLink: (projectId: string, data: InviteLinkCreate) =>
    fetchApi<{ invite_token: string; invite_url: string }>(
      `/api/projects/${projectId}/invite-links`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  remove: (projectId: string, memberId: number) =>
    fetchApi(`/api/projects/${projectId}/members/${memberId}`, {
      method: "DELETE",
    }),
  previewInvite: (token: string) =>
    fetchApi<InvitePreview>(`/api/join/${token}`),
  acceptInvite: (token: string) =>
    fetchApi<{ ok: boolean; project_id: string }>(`/api/join/${token}`, {
      method: "POST",
    }),
};

// Standups
export const standups = {
  getToday: (projectId: string) =>
    fetchApi<StandupResponse>(`/api/projects/${projectId}/standup/today`),
  submit: (projectId: string, data: StandupSubmit) =>
    fetchApi<{
      ok: boolean;
      submitted_count: number;
      total_active_members: number;
    }>(`/api/projects/${projectId}/standup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getStatus: (projectId: string) =>
    fetchApi<MemberStatus[]>(`/api/projects/${projectId}/standups/status`),
};

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  deadline?: string;
  standup_closes_at: string;
  leader_id: number;
}

export interface ProjectWithStatus extends Project {
  role: string;
  status: string;
  today_status: "standup_due" | "submitted" | "brief_ready";
}

export interface ProjectMember {
  id: number;
  project_id: string;
  user_id?: number;
  email?: string;
  role: string;
  status: "invited" | "active" | "declined" | "removed";
  invite_token?: string;
  invite_type?: "email" | "link";
  joined_at?: string;
  is_first_standup: boolean;
  name?: string;
  avatar_url?: string;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
  current_member: ProjectMember;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  deadline?: string;
  standup_closes_at?: string;
}

export interface MemberInvite {
  email: string;
  role: string;
}

export interface InviteLinkCreate {
  role: string;
}

export interface InviteLink {
  id: number;
  project_id: string;
  role: string;
  invite_token: string;
  status: string;
  created_at: string;
}

export interface InvitePreview {
  project_name: string;
  role: string;
  is_used: boolean;
}

export interface StandupSubmit {
  did: string;
  will_do: string;
  blocker?: string;
}

export interface Standup {
  id: number;
  project_id: string;
  member_id: number;
  date: string;
  did: string;
  will_do: string;
  blocker?: string;
  submitted_at: string;
}

export interface StandupResponse {
  submitted: boolean;
  standup?: Standup;
  member_id?: number;
  is_first_standup?: boolean;
  standup_closed?: boolean;
  message?: string;
}

export interface MemberStatus {
  name: string;
  role: string;
  submitted: boolean;
}

export interface Brief {
  id: number;
  project_id: string;
  date: string;
  content: string;
  generated_at: string;
  submissions_count: number;
  total_active_members: number;
}
