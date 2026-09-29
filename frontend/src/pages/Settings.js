import { useState, useEffect } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useTheme } from "@/context/ThemeContext";
import { CURRENCIES } from "@/lib/format";
import { TIMEZONES } from "@/lib/constants";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamTab } from "@/components/settings/TeamTab";
import { Loader2 } from "lucide-react";

function Row({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { user, refresh } = useAuth();
  const { setCurrency } = useCurrency();
  const { pref, setThemePref } = useTheme();
  const [org, setOrg] = useState(null);
  const [profile, setProfile] = useState({ name: "", phone: "", job_title: "" });
  const [prefs, setPrefs] = useState({ currency: "USD", timezone: "America/New_York", date_format: "MMM d, yyyy", email_notifications: true });
  const [saving, setSaving] = useState("");

  useEffect(() => {
    api.get("/organizations/current").then(({ data }) => setOrg(data)).catch(() => {});
    if (user) {
      setProfile({ name: user.name || "", phone: user.phone || "", job_title: user.job_title || "" });
      setPrefs({ ...prefs, ...(user.preferences || {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveOrg = async () => {
    setSaving("org");
    try {
      await api.put("/settings/organization", org);
      toast.success("Business info updated");
      await refresh();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(""); }
  };
  const saveProfile = async () => {
    setSaving("profile");
    try { await api.put("/settings/profile", profile); toast.success("Profile updated"); await refresh(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setSaving(""); }
  };
  const savePrefs = async () => {
    setSaving("prefs");
    try {
      await api.put("/settings/preferences", prefs);
      setCurrency(prefs.currency);
      localStorage.setItem("bmp_currency", prefs.currency);
      toast.success("Preferences saved");
      await refresh();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(""); }
  };

  if (!org) return null;

  return (
    <div className="space-y-6 animate-in-up">
      <PageHeader title="Settings" subtitle="Manage your business, profile and preferences." />

      <Tabs defaultValue="business">
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="business" data-testid="tab-business">Business</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences">Preferences</TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">Invoicing</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card className="border-border/70 bg-card/90 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row label="Company Name"><Input value={org.name || ""} onChange={(e) => setOrg({ ...org, name: e.target.value })} data-testid="org-name" /></Row>
              <Row label="Industry"><Input value={org.industry || ""} onChange={(e) => setOrg({ ...org, industry: e.target.value })} /></Row>
              <Row label="Email"><Input value={org.email || ""} onChange={(e) => setOrg({ ...org, email: e.target.value })} /></Row>
              <Row label="Phone"><Input value={org.phone || ""} onChange={(e) => setOrg({ ...org, phone: e.target.value })} /></Row>
              <Row label="Website"><Input value={org.website || ""} onChange={(e) => setOrg({ ...org, website: e.target.value })} /></Row>
              <Row label="Tax ID"><Input value={org.tax_id || ""} onChange={(e) => setOrg({ ...org, tax_id: e.target.value })} /></Row>
              <Row label="City"><Input value={org.city || ""} onChange={(e) => setOrg({ ...org, city: e.target.value })} /></Row>
              <Row label="Country"><Input value={org.country || ""} onChange={(e) => setOrg({ ...org, country: e.target.value })} /></Row>
              <div className="sm:col-span-2"><Row label="Address"><Textarea value={org.address || ""} onChange={(e) => setOrg({ ...org, address: e.target.value })} rows={2} /></Row></div>
            </div>
            <Button className="mt-5" onClick={saveOrg} disabled={saving === "org"} data-testid="save-business">
              {saving === "org" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Business Info
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <TeamTab />
        </TabsContent>

        <TabsContent value="profile">
          <Card className="border-border/70 bg-card/90 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row label="Full Name"><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} data-testid="profile-name" /></Row>
              <Row label="Email"><Input value={user?.email || ""} disabled /></Row>
              <Row label="Phone"><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Row>
              <Row label="Job Title"><Input value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} /></Row>
            </div>
            <Button className="mt-5" onClick={saveProfile} disabled={saving === "profile"} data-testid="save-profile">
              {saving === "profile" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Profile
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card className="border-border/70 bg-card/90 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row label="Display Currency">
                <Select value={prefs.currency} onValueChange={(v) => setPrefs({ ...prefs, currency: v })}>
                  <SelectTrigger data-testid="pref-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(CURRENCIES).map((c) => <SelectItem key={c} value={c}>{CURRENCIES[c].symbol} {c} — {CURRENCIES[c].name}</SelectItem>)}</SelectContent>
                </Select>
              </Row>
              <Row label="Timezone">
                <Select value={prefs.timezone} onValueChange={(v) => setPrefs({ ...prefs, timezone: v })}>
                  <SelectTrigger data-testid="pref-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Row>
              <Row label="Appearance">
                <Select value={pref} onValueChange={setThemePref}>
                  <SelectTrigger data-testid="pref-theme"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System (auto)</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border/70 p-4">
              <div><p className="text-sm font-medium">Email Notifications</p><p className="text-xs text-muted-foreground">Receive alerts about invoices and tasks.</p></div>
              <Switch checked={prefs.email_notifications} onCheckedChange={(v) => setPrefs({ ...prefs, email_notifications: v })} data-testid="pref-notifications" />
            </div>
            <Button className="mt-5" onClick={savePrefs} disabled={saving === "prefs"} data-testid="save-preferences">
              {saving === "prefs" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Preferences
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="invoicing">
          <Card className="border-border/70 bg-card/90 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row label="Invoice Prefix"><Input value={org.invoice_prefix || ""} onChange={(e) => setOrg({ ...org, invoice_prefix: e.target.value })} data-testid="invoice-prefix" /></Row>
              <Row label="Default Tax Rate (%)"><Input type="number" value={(org.invoice_tax_rate || 0) * 100} onChange={(e) => setOrg({ ...org, invoice_tax_rate: Number(e.target.value) / 100 })} /></Row>
              <Row label="Payment Due (days)"><Input type="number" value={org.invoice_due_days || 30} onChange={(e) => setOrg({ ...org, invoice_due_days: Number(e.target.value) })} /></Row>
              <Row label="Currency"><Select value={org.currency || "USD"} onValueChange={(v) => setOrg({ ...org, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(CURRENCIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select></Row>
              <div className="sm:col-span-2"><Row label="Default Invoice Notes"><Textarea value={org.invoice_notes || ""} onChange={(e) => setOrg({ ...org, invoice_notes: e.target.value })} rows={2} /></Row></div>
            </div>
            <Button className="mt-5" onClick={saveOrg} disabled={saving === "org"} data-testid="save-invoicing">
              {saving === "org" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Invoice Settings
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
