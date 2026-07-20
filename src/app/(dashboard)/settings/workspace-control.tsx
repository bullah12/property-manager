"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/api-client";
import type { WorkspaceListDto, WorkspaceMemberDto } from "@/lib/types";

export function WorkspaceControl() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await api.get<WorkspaceListDto>("/api/v1/workspaces")).data,
  });
  const members = useQuery({
    queryKey: ["workspace-members"],
    queryFn: async () =>
      (await api.get<WorkspaceMemberDto[]>("/api/v1/workspaces/members")).data,
  });

  const switchWorkspace = useMutation({
    mutationFn: (workspaceId: string) =>
      api.patch("/api/v1/workspaces/active", { workspaceId }),
    onSuccess: () => window.location.reload(),
    onError: showError,
  });

  const addMember = useMutation({
    mutationFn: () =>
      api.post<WorkspaceMemberDto>("/api/v1/workspaces/members", { email, role: "admin" }),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      toast.success("Account linked to this portfolio");
    },
    onError: showError,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/v1/workspaces/members/${userId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      toast.success("Account access removed");
    },
    onError: showError,
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Portfolio access</CardTitle>
        <CardDescription>
          Data is isolated by portfolio. Link an existing account to share this
          portfolio, or switch between portfolios you can access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {workspaces.data && workspaces.data.workspaces.length > 1 ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="active-workspace">
              Active portfolio
            </label>
            <select
              id="active-workspace"
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={workspaces.data.activeWorkspaceId}
              disabled={switchWorkspace.isPending}
              onChange={(event) => switchWorkspace.mutate(event.target.value)}
            >
              {workspaces.data.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} ({workspace.role})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) addMember.mutate();
          }}
        >
          <div className="text-sm font-medium">Link an existing account</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
              required
            />
            <Button type="submit" disabled={addMember.isPending}>
              Link account
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The person must sign in once before their account can be linked.
          </p>
        </form>

        <div className="space-y-2">
          <div className="text-sm font-medium">People with access</div>
          {members.data?.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{member.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {member.email} · {member.role}
                </div>
              </div>
              {member.role !== "owner" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate(member.userId)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof ApiClientError ? error.message : "Request failed");
}
