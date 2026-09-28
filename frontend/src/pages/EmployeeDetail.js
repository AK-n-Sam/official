import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Building2, Calendar } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useCurrency } from "@/context/CurrencyContext";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="w-32 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { format } = useCurrency();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/employees/${id}`).then(({ data }) => { setEmp(data); setError(null); })
      .catch((e) => setError(e)).finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (error) return <ErrorState message={formatApiError(error)} onRetry={load} />;

  const initials = (emp.name || "E").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-6 animate-in-up">
      <Button variant="ghost" size="sm" onClick={() => navigate("/employees")} className="-ml-2" data-testid="back-to-employees">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Employees
      </Button>

      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 border border-border/60">
          <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="employee-detail-name">{emp.name}</h1>
          <p className="text-sm text-muted-foreground">{emp.job_title} · {emp.department}</p>
          <div className="mt-1"><StatusBadge status={emp.status} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border/70 bg-card/90 p-6 lg:col-span-2">
          <h3 className="mb-2 font-heading text-base font-semibold">Details</h3>
          <div className="divide-y divide-border/50">
            <Row icon={Mail} label="Email" value={emp.email} />
            <Row icon={Phone} label="Phone" value={emp.phone} />
            <Row icon={Building2} label="Department" value={emp.department} />
            <Row icon={Calendar} label="Joining Date" value={formatDate(emp.hire_date)} />
          </div>
        </Card>
        <Card className="border-border/70 bg-card/90 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Annual Salary</p>
          <p className="mt-1.5 font-mono text-3xl font-extrabold">{format(emp.salary)}</p>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/90 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
        <p className="mt-1 text-sm text-muted-foreground">{emp.notes || "No notes."}</p>
      </Card>
    </div>
  );
}
