import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { projects, type ProjectWithStatus } from "@/lib/api";
import { AppNav } from "@/components/app/AppNav";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — StandupBot" },
      { name: "description", content: "Your projects and standups" },
    ],
  }),
});

function Dashboard() {
  const { user, isLoading: authLoading, login } = useAuth();
  const navigate = useNavigate();

  const {
    data: projectsList,
    isLoading: projectsLoading,
    error,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: projects.list,
    enabled: !!user,
  });

  const {
    data: pendingInvites,
    isLoading: invitesLoading,
  } = useQuery({
    queryKey: ["pending-invites"],
    queryFn: async () => {
      const db = await fetch("http://localhost:8000/api/pending-invites", {
        credentials: "include",
      });
      return db.json();
    },
    enabled: !!user,
  });

  // Redirect to login if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !user) {
      // Add a small delay to avoid redirect loops
      const timer = setTimeout(() => {
        login();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authLoading, user, login]);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-3 h-3 bg-[var(--persian)] rotate-45 animate-pulse" />
          <p className="mt-4 text-[var(--ink-soft)]">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated after loading, show nothing (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppNav />

      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="font-display font-bold text-5xl md:text-6xl text-[var(--ink)]">
              Your projects
            </h1>
            <p className="mt-3 text-[var(--ink-soft)]">
              {projectsList?.length || 0} active{" "}
              {projectsList?.length === 1 ? "project" : "projects"}
            </p>
          </div>
          <Link
            to="/projects/new"
            className="btn-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New project
          </Link>
        </div>

        {/* Loading state */}
        {projectsLoading && (
          <div className="text-center py-12">
            <div className="inline-block w-3 h-3 bg-[var(--persian)] rotate-45 animate-pulse" />
            <p className="mt-4 text-[var(--ink-soft)]">Loading projects...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="box border-[var(--destructive)] bg-[#FEE2E2] p-6">
            <p className="text-[var(--destructive)] font-medium">
              Failed to load projects. Please try again.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!projectsLoading && projectsList?.length === 0 && !pendingInvites?.length && (
          <div className="box box-shadow-hard p-12 text-center">
            <div className="inline-block w-4 h-4 bg-[var(--persian)] rotate-45 mb-6" />
            <h2 className="font-display text-3xl text-[var(--ink)] mb-3">
              No projects yet
            </h2>
            <p className="text-[var(--ink-soft)] mb-6 max-w-md mx-auto">
              Create your first project to start running async standups with your team.
            </p>
            <Link to="/projects/new" className="btn-primary">
              Create your first project
            </Link>
          </div>
        )}

        {/* Pending invites */}
        {pendingInvites && pendingInvites.length > 0 && (
          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-[var(--ink)] mb-4">
              Pending invites
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingInvites.map((invite: any) => (
                <PendingInviteCard key={invite.id} invite={invite} />
              ))}
            </div>
          </div>
        )}

        {/* Projects grid */}
        {projectsList && projectsList.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectsList.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PendingInviteCard({ invite }: { invite: any }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const acceptMutation = useMutation({
    mutationFn: () =>
      fetch(`http://localhost:8000/api/projects/${invite.project_id}/members/${invite.id}/accept`, {
        method: "POST",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Invite accepted!");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      navigate({ to: "/projects/$projectId", params: { projectId: invite.project_id } });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () =>
      fetch(`http://localhost:8000/api/projects/${invite.project_id}/members/${invite.id}/decline`, {
        method: "POST",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Invite declined");
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
  });

  return (
    <div className="box box-shadow-hard p-6 bg-[#DBEAFE]">
      <div className="mb-4">
        <h3 className="font-display text-xl text-[var(--ink)] mb-1">
          {invite.project_name}
        </h3>
        <p className="text-sm text-[var(--ink-soft)]">
          Role: <span className="font-medium text-[var(--ink)]">{invite.role}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          className="btn-primary flex-1 justify-center text-sm !py-2"
        >
          Accept
        </button>
        <button
          onClick={() => declineMutation.mutate()}
          disabled={declineMutation.isPending}
          className="btn-ghost flex-1 justify-center text-sm !py-2"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithStatus }) {
  const daysRemaining = project.deadline
    ? Math.ceil(
        (new Date(project.deadline).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const statusConfig = {
    standup_due: {
      label: "Standup due",
      color: "text-[#D97706]",
      bg: "bg-[#FEF3C7]",
    },
    submitted: {
      label: "Submitted",
      color: "text-[#16A34A]",
      bg: "bg-[#DCFCE7]",
    },
    brief_ready: {
      label: "Brief ready",
      color: "text-[#2563EB]",
      bg: "bg-[#DBEAFE]",
    },
  };

  const status = statusConfig[project.today_status];

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="box box-shadow-hard p-6 group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="font-display text-2xl text-[var(--ink)] group-hover:text-[var(--persian)] transition-colors">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-[var(--ink-soft)] mt-1 line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
        {project.role === "Project Leader" && (
          <span className="pill text-xs !py-1 !px-2">Leader</span>
        )}
      </div>

      {/* Role */}
      <div className="text-xs text-[var(--ink-soft)] mb-4">
        Your role: <span className="font-medium text-[var(--ink)]">{project.role}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--line)]">
        <div className="flex items-center gap-2">
          <span className={`pill text-xs !py-1 !px-2 ${status.bg} ${status.color} border-0`}>
            {status.label}
          </span>
        </div>
        {daysRemaining !== null && (
          <div className="text-xs text-[var(--ink-soft)]">
            {daysRemaining > 0 ? (
              <>
                <span className="font-medium text-[var(--ink)]">{daysRemaining}</span> days left
              </>
            ) : daysRemaining === 0 ? (
              <span className="font-medium text-[var(--destructive)]">Due today</span>
            ) : (
              <span className="font-medium text-[var(--destructive)]">Overdue</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
