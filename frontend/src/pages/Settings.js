import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
import { AuditLogTab } from "@/components/settings/AuditLogTab";
import { PersonalizationTab } from "@/components/settings/PersonalizationTab";
import { Loader2, Mail, MessageSquare, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

function Row({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const SETTINGS_TABS = ["business", "team", "profile", "personalization", "preferences", "invoicing", "channels", "audit"];

export default function Settings() {
  const { user, refresh } = useAuth();
  // `?tab=` deep links (help topics, the account menu) pick the tab, even when already on this page.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(SETTINGS_TABS.includes(tabParam) ? tabParam : "business");
  useEffect(() => {
    if (SETTINGS_TABS.includes(tabParam)) setTab(tabParam);
  }, [tabParam]);
  const changeTab = (t) => { setTab(t); setSearchParams(t === "business" ? {} : { tab: t }, { replace: true }); };
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
      <PageHeader title="Settings" subtitle="Manage your business, profile, personalization and preferences." />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="business" data-testid="tab-business">Business</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="personalization" data-testid="tab-personalization">Personalization</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences">Preferences</TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">Invoicing</TabsTrigger>
          <TabsTrigger value="channels" data-testid="tab-channels">Connected Channels</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
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

        <TabsContent value="personalization">
          <Card className="border-border/70 bg-card/90 p-6">
            <PersonalizationTab />
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

        <TabsContent value="channels">
          <ConnectedChannelsTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectedChannelsTab() {
  const [accounts, setAccounts] = useState([]);
  const [providersConfig, setProvidersConfig] = useState({});

  useEffect(() => {
    api.get("/communications/accounts")
      .then((res) => {
        setAccounts(res.data.accounts || []);
        setProvidersConfig(res.data.providers_config || {});
      })
      .catch((e) => console.error(e));
  }, []);

  const gmailConnected = accounts.some((a) => a.provider === "gmail" && a.status === "connected");
  const outlookConnected = accounts.some((a) => a.provider === "outlook" && a.status === "connected");
  const whatsappConnected = accounts.some((a) => a.provider === "whatsapp" && a.status === "connected");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Connected Communications Layer</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Manage real-time integrations for Gmail, Microsoft 365, and WhatsApp Business API.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.location.href = "/communications"} className="text-xs gap-1.5 shrink-0">
          Open Unified Inbox <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gmail Card */}
        <Card className="p-5 border-border/70 bg-card/90 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-red-500" />
                <span className="font-semibold text-sm">Google Gmail</span>
              </div>
              {gmailConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Sync customer emails, send responses directly from Six6Fix, and trigger automated follow-ups.
            </p>
          </div>
          <div className="pt-2 border-t border-border/40">
            {providersConfig.gmail_configured ? (
              <Button size="sm" className="w-full text-xs" onClick={() => window.location.href = "/api/communications/connect/gmail"}>
                {gmailConnected ? "Reconnect Gmail" : "Connect Gmail OAuth"}
              </Button>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Set GMAIL_CLIENT_ID in server environment to enable 1-click connect.
              </p>
            )}
          </div>
        </Card>

        {/* Outlook Card */}
        <Card className="p-5 border-border/70 bg-card/90 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                <span className="font-semibold text-sm">Microsoft Outlook</span>
              </div>
              {outlookConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Integrate Microsoft 365 or Outlook inbox for enterprise email sync, internal notes, and lead auto-creation.
            </p>
          </div>
          <div className="pt-2 border-t border-border/40">
            {providersConfig.outlook_configured ? (
              <Button size="sm" className="w-full text-xs" onClick={() => window.location.href = "/api/communications/connect/outlook"}>
                {outlookConnected ? "Reconnect Outlook" : "Connect Outlook OAuth"}
              </Button>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Set MICROSOFT_CLIENT_ID in server environment to enable 1-click connect.
              </p>
            )}
          </div>
        </Card>

        {/* WhatsApp Card */}
        <Card className="p-5 border-border/70 bg-card/90 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-500" />
                <span className="font-semibold text-sm">WhatsApp Business</span>
              </div>
              {whatsappConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Send and receive official Meta WhatsApp messages. Webhook URL: <code className="bg-muted px-1 rounded text-[10px]">/api/webhooks/whatsapp</code>
            </p>
          </div>
          <div className="pt-2 border-t border-border/40">
            {providersConfig.whatsapp_configured ? (
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => window.location.href = "/communications?tab=channels"}>
                Manage WhatsApp Webhooks
              </Button>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Set WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID in server environment.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
