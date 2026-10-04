import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Briefcase, CheckSquare, ShieldCheck, MessageSquare, Plus, ArrowRight, Zap, Users } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MyWork from "@/pages/MyWork";
import Employees from "@/pages/Employees";
import Tasks from "@/pages/Tasks";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

export default function PeopleModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "my-work";
  const navigate = useNavigate();

  const handleTabChange = (val) => {
    setSearchParams({ tab: val });
  };

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader
        title="People & Work Engine"
        subtitle="Who is doing the work? Team workload, tasks, approvals, and collaboration."
      >
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/tasks?new=1")} data-testid="new-task-people-btn">
            <Plus className="mr-1.5 h-4 w-4" /> New Task
          </Button>
          <Button variant="outline" onClick={() => navigate("/employees?new=1")} data-testid="new-employee-people-btn">
            <Plus className="mr-1.5 h-4 w-4" /> Add Team Member
          </Button>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs px-3 py-1 font-semibold">
            ⚡ Flagship Module 5
          </Badge>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-card border border-border/70 p-1" data-testid="people-tabs">
          <TabsTrigger value="my-work" data-testid="tab-people-my-work">My Work</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-people-team">Team & Workload</TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-people-approvals">Approvals</TabsTrigger>
          <TabsTrigger value="collaboration" data-testid="tab-people-collaboration">Collaboration</TabsTrigger>
        </TabsList>

        {/* MY WORK */}
        <TabsContent value="my-work" className="space-y-4">
          <MyWork />
        </TabsContent>

        {/* TEAM & WORKLOAD */}
        <TabsContent value="team" className="space-y-6">
          <Employees />
          <div className="pt-4 border-t border-border">
            <h3 className="text-lg font-bold font-heading mb-4">Task Allocation & Assignment</h3>
            <Tasks />
          </div>
        </TabsContent>

        {/* APPROVALS */}
        <TabsContent value="approvals" className="space-y-4">
          <MyWork defaultSection="approvals" />
        </TabsContent>

        {/* COLLABORATION */}
        <TabsContent value="collaboration" className="space-y-4">
          <Card className="border-border bg-card p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Company Activity & Collaboration Feed</h3>
            <ActivityFeed />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
