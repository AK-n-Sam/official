import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Lock, Info } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth, usePermissions } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLayout } from "@/context/LayoutContext";
import { CURRENCIES } from "@/lib/format";
import { TIMEZONES } from "@/lib/constants";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamTab } from "@/components/settings/TeamTab";

function Row({ label, htmlFor, help, children }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function ReadOnlyNote() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="settings-readonly">
      <Lock className="h-3.5 w-3.5" /> Only owners and admins can change these settings.
    </p>
  );
}

const SETTINGS_TABS = ["business", "team", "profile", "preferences", "invoicing"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ChangePassword() {
  const { changePassword, user } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 8) return setErr("Use at least 8 characters for the new password");
    if (form.next !== form.confirm) return setErr("The new passwords don't match");
    setSaving(true); setErr("");
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      toast.success("Password changed. Other devices have been signed out.");
    } catch (e2) { setErr(formatApiError(e2)); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-border/70 bg-card/90 p-6" data-testid="change-password-card">
      <h3 className="font-heading text-base font-semibold">Password</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {user?.must_change_password ? "You're using a temporary password from your invite. Choose your own now." : "Changing your password signs you out on every other device."}
      </p>
      <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
        <Row label="Current password" htmlFor="pw-current"><Input id="pw-current" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} data-testid="pw-current" /></Row>
        <Row label="New password" htmlFor="pw-new" help="At least 8 characters"><Input id="pw-new" type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} data-testid="pw-new" /></Row>
        <Row label="Confirm new password" htmlFor="pw-confirm"><Input id="pw-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} data-testid="pw-confirm" /></Row>
        {err && <p className="text-sm text-rose-500 sm:col-span-3" role="alert" data-testid="pw-error">{err}</p>}
        <div className="sm:col-span-3">
          <Button type="submit" disabled={saving || !form.current || !form.next} data-testid="pw-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Settings() {
  const { user, refresh } = useAuth();
  const { isManager } = usePermissions();
  // `?tab=` deep links (help topics, the account menu) pick the tab, even when already on this page.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(SETTINGS_TABS.includes(tabParam) ? tabParam : "business");
  useEffect(() => {
    if (SETTINGS_TABS.includes(tabParam)) setTab(tabParam);
  }, [tabParam]);
  const changeTab = (t) => { setTab(t); setSearchParams(t === "business" ? {} : { tab: t }, { replace: true }); };
  const { pref, setThemePref } = useTheme();
  const { density, setDensity } = useLayout();
  const [org, setOrg] = useState(null);
  const [saved, setSaved] = useState(null);
  const [orgError, setOrgError] = useState(null);
  const [profile, setProfile] = useState({ name: "", phone: "", job_title: "" });
  const [saving, setSaving] = useState("");

  const loadOrg = useCallback(() => {
    setOrgError(null);
    api.get("/organizations/current").then(({ data }) => { setOrg(data); setSaved(data); }).catch((e) => setOrgError(e));
  }, []);
  useEffect(loadOrg, [loadOrg, user?.active_org_id]);
  useEffect(() => {
    if (user) setProfile({ name: user.name || "", phone: user.phone || "", job_title: user.job_title || "" });
  }, [user]);

  const saveOrg = async (fields, label) => {
    if (fields.includes("name") && !org.name?.trim()) return toast.error("The business name can't be empty");
    if (fields.includes("email") && org.email && !EMAIL_RE.test(org.email.trim())) return toast.error("Enter a valid business email");
    setSaving(label);
    try {
      const payload = Object.fromEntries(fields.map((k) => [k, org[k] ?? ""]));
      const { data } = await api.put("/settings/organization", payload);
      setOrg(data); setSaved(data);
      toast.success(label === "invoicing" ? "Invoice settings saved" : "Business details saved");
      // Name and currency show up across the app.
      if (data.currency !== saved?.currency || data.name !== saved?.name) await refresh();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(""); }
  };
  const saveProfile = async (e) => {
    e?.preventDefault();
    if (!profile.name.trim()) return toast.error("Your name can't be empty");
    setSaving("profile");
    try { await api.put("/settings/profile", profile); toast.success("Profile updated"); await refresh(); }
    catch (e2) { toast.error(formatApiError(e2)); } finally { setSaving(""); }
  };

  const set = (k) => (e) => setOrg({ ...org, [k]: e.target.value });
  const ro = !isManager;
  const currencyChanged = saved && org && org.currency !== saved.currency;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Settings" subtitle="Your business, team, profile and preferences." />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList data-testid="settings-tabs" className="h-auto flex-wrap">
          <TabsTrigger value="business" data-testid="tab-business">Business</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">Invoicing</TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          {orgError ? <ErrorState message={formatApiError(orgError)} onRetry={loadOrg} /> : !org ? <Skeleton className="h-72 rounded-xl" /> : (
            <Card className="border-border/70 bg-card/90 p-6">
              {ro && <ReadOnlyNote />}
              <fieldset disabled={ro} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Row label="Business name *" htmlFor="org-name"><Input id="org-name" value={org.name || ""} onChange={set("name")} data-testid="org-name" /></Row>
                <Row label="Industry" htmlFor="org-industry"><Input id="org-industry" value={org.industry || ""} onChange={set("industry")} /></Row>
                <Row label="Email" htmlFor="org-email" help="Shown on your invoices"><Input id="org-email" type="email" value={org.email || ""} onChange={set("email")} /></Row>
                <Row label="Phone" htmlFor="org-phone"><Input id="org-phone" value={org.phone || ""} onChange={set("phone")} /></Row>
                <Row label="Website" htmlFor="org-website"><Input id="org-website" value={org.website || ""} onChange={set("website")} /></Row>
                <Row label="Tax ID" htmlFor="org-tax"><Input id="org-tax" value={org.tax_id || ""} onChange={set("tax_id")} /></Row>
                <Row label="City" htmlFor="org-city"><Input id="org-city" value={org.city || ""} onChange={set("city")} /></Row>
                <Row label="Country" htmlFor="org-country"><Input id="org-country" value={org.country || ""} onChange={set("country")} /></Row>
                <div className="sm:col-span-2"><Row label="Address" htmlFor="org-address"><Textarea id="org-address" value={org.address || ""} onChange={set("address")} rows={2} /></Row></div>
                <Row label="Currency" help="All amounts in this workspace are recorded and shown in this currency.">
                  <Select value={org.currency || "USD"} onValueChange={(v) => setOrg({ ...org, currency: v })} disabled={ro}>
                    <SelectTrigger data-testid="org-currency"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.keys(CURRENCIES).map((c) => <SelectItem key={c} value={c}>{CURRENCIES[c].symbol} {c} — {CURRENCIES[c].name}</SelectItem>)}</SelectContent>
                  </Select>
                </Row>
                <Row label="Timezone">
                  <Select value={org.timezone || "America/New_York"} onValueChange={(v) => setOrg({ ...org, timezone: v })} disabled={ro}>
                    <SelectTrigger data-testid="org-timezone"><SelectValue /></SelectTrigger>
                    <SelectContent>{[...new Set([org.timezone, ...TIMEZONES].filter(Boolean))].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </Row>
              </fieldset>
              {currencyChanged && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs" data-testid="currency-warning">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Existing amounts are not converted: an invoice for 100 {saved.currency} will show as 100 {org.currency}. Only change this if the workspace was set up with the wrong currency.
                </p>
              )}
              {!ro && (
                <Button className="mt-5" onClick={() => saveOrg(["name", "industry", "email", "phone", "website", "tax_id", "city", "country", "address", "currency", "timezone"], "business")} disabled={saving === "business"} data-testid="save-business">
                  {saving === "business" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save business details
                </Button>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="team">
          <TeamTab />
        </TabsContent>

        <TabsContent value="invoicing">
          {orgError ? <ErrorState message={formatApiError(orgError)} onRetry={loadOrg} /> : !org ? <Skeleton className="h-60 rounded-xl" /> : (
            <Card className="border-border/70 bg-card/90 p-6">
              {ro && <ReadOnlyNote />}
              <fieldset disabled={ro} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Row label="Invoice number prefix" htmlFor="inv-prefix" help={`Next invoice: ${(org.invoice_prefix || "INV").toUpperCase()}-${(org.invoice_seq || 1000) + 1}`}>
                  <Input id="inv-prefix" value={org.invoice_prefix || ""} maxLength={12} onChange={(e) => setOrg({ ...org, invoice_prefix: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })} data-testid="invoice-prefix" />
                </Row>
                <Row label="Default tax rate (%)" htmlFor="inv-tax">
                  <Input id="inv-tax" type="number" min={0} max={100} step="0.01" value={+((org.invoice_tax_rate || 0) * 100).toFixed(4)}
                    onChange={(e) => setOrg({ ...org, invoice_tax_rate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })} />
                </Row>
                <Row label="Payment due after (days)" htmlFor="inv-due" help="Sets the due date on new invoices">
                  <Input id="inv-due" type="number" min={0} max={365} step={1} value={org.invoice_due_days ?? 30}
                    onChange={(e) => setOrg({ ...org, invoice_due_days: Math.min(365, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                </Row>
                <div className="sm:col-span-2"><Row label="Default invoice notes" htmlFor="inv-notes" help="Printed on new invoices, e.g. bank details or payment terms"><Textarea id="inv-notes" value={org.invoice_notes || ""} onChange={set("invoice_notes")} rows={3} /></Row></div>
              </fieldset>
              {!ro && (
                <Button className="mt-5" onClick={() => saveOrg(["invoice_prefix", "invoice_tax_rate", "invoice_due_days", "invoice_notes"], "invoicing")} disabled={saving === "invoicing"} data-testid="save-invoicing">
                  {saving === "invoicing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save invoice settings
                </Button>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="profile" className="space-y-5">
          <Card className="border-border/70 bg-card/90 p-6">
            <form onSubmit={saveProfile} noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Row label="Full name *" htmlFor="profile-name"><Input id="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} data-testid="profile-name" /></Row>
                <Row label="Email" htmlFor="profile-email" help="Your sign-in email can't be changed here"><Input id="profile-email" value={user?.email || ""} disabled /></Row>
                <Row label="Phone" htmlFor="profile-phone"><Input id="profile-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Row>
                <Row label="Job title" htmlFor="profile-title"><Input id="profile-title" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} /></Row>
              </div>
              <Button type="submit" className="mt-5" disabled={saving === "profile"} data-testid="save-profile">
                {saving === "profile" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save profile
              </Button>
            </form>
          </Card>
          {user?.provider !== "google" && <ChangePassword />}
        </TabsContent>

        <TabsContent value="preferences">
          <Card className="border-border/70 bg-card/90 p-6">
            <p className="mb-4 text-sm text-muted-foreground">These apply to you on this device and save automatically.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row label="Appearance">
                <Select value={pref} onValueChange={setThemePref}>
                  <SelectTrigger data-testid="pref-theme"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Match my system</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border/70 p-4">
              <div><p className="text-sm font-medium">Compact rows</p><p className="text-xs text-muted-foreground">Fit more rows on screen in tables and lists.</p></div>
              <Switch checked={density === "compact"} onCheckedChange={(v) => setDensity(v ? "compact" : "comfortable")} aria-label="Compact rows" data-testid="pref-density" />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
