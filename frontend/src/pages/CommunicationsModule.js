import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageSquare, Mail, Phone, Zap, Send, User, Plus, RefreshCw, CheckCircle2, ShieldCheck, Clock, Paperclip, ChevronRight, Filter, AlertCircle, Sparkles, Building2, Tag, ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function CommunicationsModule() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "inbox");
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [convDetail, setConvDetail] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [providersConfig, setProvidersConfig] = useState({});
  const [filterChannel, setFilterChannel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);

  // Composer State
  const [replyChannel, setReplyChannel] = useState("email");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await api.get("/communications/accounts");
      setAccounts(res.data.accounts || []);
      setProvidersConfig(res.data.providers_config || {});
    } catch (e) {
      console.error("Accounts load error", e);
    }
  };

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterChannel !== "all") params.channel = filterChannel;
      const res = await api.get("/communications/conversations", { params });
      const convs = res.data.conversations || [];
      setConversations(convs);
      if (convs.length > 0 && !selectedConvId) {
        setSelectedConvId(convs[0].id);
      }
    } catch (e) {
      console.error("Conversations load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterChannel]);

  useEffect(() => {
    if (!selectedConvId) return;
    setLoadingDetail(true);
    api.get(`/communications/conversations/${selectedConvId}`)
      .then((res) => {
        setConvDetail(res.data);
        if (res.data.conversation) {
          setReplyChannel(res.data.conversation.channel === "whatsapp" ? "whatsapp" : "email");
          setReplySubject(res.data.conversation.subject ? `Re: ${res.data.conversation.subject}` : "");
        }
      })
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoadingDetail(false));
  }, [selectedConvId]);

  const handleSendReply = async () => {
    if (!replyBody.trim() || !convDetail?.conversation) return;
    setSending(true);
    try {
      const conv = convDetail.conversation;
      const recipient = conv.customer?.email || conv.customer?.phone || "customer@example.com";
      await api.post(`/communications/conversations/${selectedConvId}/messages`, {
        channel: replyChannel,
        recipient: recipient,
        subject: replySubject,
        body: replyBody
      });
      toast.success("Message sent successfully!");
      setReplyBody("");
      // Refresh detail
      const res = await api.get(`/communications/conversations/${selectedConvId}`);
      setConvDetail(res.data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!internalNote.trim()) return;
    setSubmittingNote(true);
    try {
      await api.post(`/communications/conversations/${selectedConvId}/notes`, { note: internalNote });
      toast.success("Internal note added");
      setInternalNote("");
      const res = await api.get(`/communications/conversations/${selectedConvId}`);
      setConvDetail(res.data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleManualSync = async () => {
    try {
      const res = await api.post("/communications/sync");
      toast.success("Channel sync complete!", { description: `${res.data.synced_accounts_count} channels updated` });
      fetchAccounts();
      fetchConversations();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleConnectProvider = async (provider) => {
    try {
      const res = await api.post("/communications/accounts/connect-url", { provider });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const filteredConvs = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.subject || "").toLowerCase().includes(q) || (c.channel || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 animate-in-up font-sans">
      <PageHeader
        title="Unified Inbox & Communications"
        subtitle="Connect Gmail, Outlook & WhatsApp Business into one coherent SME communications layer."
      >
        <Button variant="outline" size="sm" onClick={handleManualSync} className="h-9 px-3 gap-1.5 border-border bg-card">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Sync Channels</span>
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(t) => { setActiveTab(t); setSearchParams({ tab: t }); }} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-9">
          <TabsTrigger value="inbox" className="text-xs font-semibold gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Unified Inbox ({conversations.length})
          </TabsTrigger>
          <TabsTrigger value="channels" className="text-xs font-semibold gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Connected Channels ({accounts.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Unified Inbox */}
        <TabsContent value="inbox" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[580px]">
            {/* Column 1: Conversations List */}
            <Card className="lg:col-span-4 border-border/70 bg-card p-3 rounded-2xl shadow-sm flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                {/* Search & Filter */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full h-8 rounded-lg border border-border/70 bg-background px-3 text-xs outline-none focus:border-primary"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {["all", "email", "whatsapp"].map((ch) => (
                    <Button
                      key={ch}
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilterChannel(ch)}
                      className={`h-7 px-2.5 text-[11px] font-semibold capitalize rounded-full ${filterChannel === ch ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {ch}
                    </Button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto max-h-[480px] space-y-1.5 pr-1 pt-1">
                {loading ? (
                  <div className="space-y-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
                ) : filteredConvs.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs font-bold text-foreground">No messages yet</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                      Connect Gmail, Outlook or WhatsApp Business under Connected Channels to manage customer communications.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setActiveTab("channels")} className="h-7 text-xs font-semibold">
                      + Connect Channels
                    </Button>
                  </div>
                ) : (
                  filteredConvs.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all space-y-1 ${selectedConvId === conv.id ? "border-primary/60 bg-accent/60" : "border-border/60 hover:bg-accent/30"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-foreground truncate">{conv.subject || "Customer Inquiry"}</span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-semibold border-border/80">
                          {conv.channel}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{conv.last_message_preview || "Conversation started"}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-0.5">
                        <span>Status: {conv.status || "open"}</span>
                        <span>{conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>

            {/* Column 2: Thread View & Response Composer */}
            <Card className="lg:col-span-5 border-border/70 bg-card p-4 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
              {loadingDetail ? (
                <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 rounded-xl" /></div>
              ) : !convDetail?.conversation ? (
                <div className="h-full flex items-center justify-center text-center p-8 text-xs text-muted-foreground">
                  Select a conversation from the list to view thread details.
                </div>
              ) : (
                <>
                  {/* Thread Header */}
                  <div className="border-b border-border/70 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-sm text-foreground">{convDetail.conversation.subject || "Customer Conversation"}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Channel: <strong className="capitalize text-foreground">{convDetail.conversation.channel}</strong> · Participant: {convDetail.customer?.name || "Customer"}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs font-semibold border-primary/40 bg-primary/5 text-primary">
                      {convDetail.conversation.status || "open"}
                    </Badge>
                  </div>

                  {/* Message Chronology */}
                  <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-1 text-xs">
                    {(convDetail.messages || []).map((msg) => (
                      <div key={msg.id} className={`p-3 rounded-xl border ${msg.direction === "outbound" ? "bg-primary/5 border-primary/20 ml-6" : "bg-card border-border/70 mr-6"}`}>
                        <div className="flex items-center justify-between pb-1">
                          <span className="font-bold text-foreground">{msg.sender}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                      </div>
                    ))}

                    {/* Internal Notes */}
                    {(convDetail.notes || []).map((n) => (
                      <div key={n.id} className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Internal Note · {n.author_name}</p>
                        <p className="text-xs">{n.note}</p>
                      </div>
                    ))}
                  </div>

                  {/* Internal Note Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="Add internal team note (not visible to customer)..."
                      className="flex-1 h-8 rounded-lg border border-border/70 bg-background px-3 text-xs outline-none focus:border-amber-500"
                    />
                    <Button size="sm" variant="outline" onClick={handleAddNote} disabled={submittingNote || !internalNote.trim()} className="h-8 text-xs">
                      + Note
                    </Button>
                  </div>

                  {/* Outbound Response Composer */}
                  <div className="border-t border-border/70 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Reply via</span>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setReplyChannel("email")} className={`h-6 text-[10px] font-semibold ${replyChannel === "email" ? "bg-primary/20 text-primary" : ""}`}>
                          Email
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setReplyChannel("whatsapp")} className={`h-6 text-[10px] font-semibold ${replyChannel === "whatsapp" ? "bg-emerald-500/20 text-emerald-600" : ""}`}>
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                    {replyChannel === "email" && (
                      <input
                        type="text"
                        value={replySubject}
                        onChange={(e) => setReplySubject(e.target.value)}
                        placeholder="Subject..."
                        className="w-full h-8 rounded-lg border border-border/70 bg-background px-3 text-xs outline-none"
                      />
                    )}
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                      placeholder={`Compose ${replyChannel} response...`}
                      className="w-full rounded-lg border border-border/70 bg-background p-2.5 text-xs outline-none focus:border-primary resize-none"
                    />
                    <div className="flex items-center justify-end">
                      <Button size="sm" onClick={handleSendReply} disabled={sending || !replyBody.trim()} className="h-8 px-4 text-xs font-bold gap-1.5 bg-black dark:bg-white text-white dark:text-black">
                        <Send className="h-3.5 w-3.5" />
                        <span>{sending ? "Sending..." : "Send Message"}</span>
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* Column 3: Contextual Business Panel */}
            <Card className="lg:col-span-3 border-border/70 bg-card p-4 rounded-2xl shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-sm text-foreground">Customer Context</h3>
                {convDetail?.customer ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-border/60 bg-accent/30 space-y-1">
                      <p className="font-bold text-xs text-foreground">{convDetail.customer.name}</p>
                      <p className="text-[11px] text-muted-foreground">{convDetail.customer.company || "Direct Customer"}</p>
                      <p className="text-[11px] text-muted-foreground">{convDetail.customer.email}</p>
                      <p className="text-[11px] text-muted-foreground">{convDetail.customer.phone}</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Outstanding Balance:</span>
                        <span className="font-mono font-bold text-foreground">{format(convDetail.customer.outstanding || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Total Sales:</span>
                        <span className="font-mono font-bold text-foreground">{format(convDetail.customer.total_sales || 0)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2">
                    <Building2 className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs font-semibold text-foreground">No customer linked</p>
                    <p className="text-[11px] text-muted-foreground">Match message to existing customer profile or create new customer.</p>
                    <Button size="sm" variant="outline" onClick={() => navigate("/customers")} className="h-7 text-xs">
                      + Link Customer
                    </Button>
                  </div>
                )}
              </div>

              {/* Contextual Quick Actions */}
              <div className="space-y-2 border-t border-border/70 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Quick Actions</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => navigate("/my-work")} className="h-8 text-xs font-semibold justify-start gap-2">
                    <Plus className="h-3.5 w-3.5 text-primary" /> Create Task
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/invoices?new=1")} className="h-8 text-xs font-semibold justify-start gap-2">
                    <Plus className="h-3.5 w-3.5 text-emerald-500" /> Create Invoice
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/sales")} className="h-8 text-xs font-semibold justify-start gap-2">
                    <Plus className="h-3.5 w-3.5 text-amber-500" /> Add Opportunity
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Connected Channels */}
        <TabsContent value="channels" className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Gmail Card */}
            <Card className="border-border/70 bg-card p-5 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-rose-500" />
                    <h3 className="font-heading font-bold text-sm text-foreground">Gmail</h3>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-bold capitalize ${providersConfig.gmail?.configured ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-amber-500/10 text-amber-600 border-amber-500/30"}`}>
                    {providersConfig.gmail?.configured ? "Configured" : "Setup Required"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect Google Workspace Gmail to synchronize customer emails, send billing notices, and trigger follow-up tasks.
                </p>
              </div>
              <Button size="sm" onClick={() => handleConnectProvider("gmail")} className="w-full h-8 text-xs font-bold gap-1.5 bg-rose-600 text-white hover:bg-rose-700">
                <Mail className="h-3.5 w-3.5" />
                <span>Connect Gmail</span>
              </Button>
            </Card>

            {/* Outlook Card */}
            <Card className="border-border/70 bg-card p-5 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-500" />
                    <h3 className="font-heading font-bold text-sm text-foreground">Microsoft 365 / Outlook</h3>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-bold capitalize ${providersConfig.outlook?.configured ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-amber-500/10 text-amber-600 border-amber-500/30"}`}>
                    {providersConfig.outlook?.configured ? "Configured" : "Setup Required"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect Microsoft 365 or Outlook mail via Microsoft Graph API for organizational email sync.
                </p>
              </div>
              <Button size="sm" onClick={() => handleConnectProvider("outlook")} className="w-full h-8 text-xs font-bold gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                <Mail className="h-3.5 w-3.5" />
                <span>Connect Outlook</span>
              </Button>
            </Card>

            {/* WhatsApp Business Card */}
            <Card className="border-border/70 bg-card p-5 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-emerald-500" />
                    <h3 className="font-heading font-bold text-sm text-foreground">WhatsApp Business</h3>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-bold capitalize ${providersConfig.whatsapp?.configured ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-amber-500/10 text-amber-600 border-amber-500/30"}`}>
                    {providersConfig.whatsapp?.configured ? "Configured" : "Setup Required"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect Meta WhatsApp Business Platform Cloud API to send automated payment confirmations and reminders.
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/settings?tab=integrations")} className="w-full h-8 text-xs font-bold gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Phone className="h-3.5 w-3.5" />
                <span>Configure WhatsApp</span>
              </Button>
            </Card>
          </div>

          {/* Setup Instructions Box */}
          <Card className="border-border/70 bg-accent/20 p-5 rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Administrator Provider Environment Setup Guide</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To connect live providers in production, configure credentials in your backend <code>.env</code> file:
            </p>
            <div className="font-mono text-[11px] bg-slate-900 text-slate-200 p-3 rounded-xl overflow-x-auto space-y-1">
              <p># Gmail OAuth 2.0 Credentials</p>
              <p>GMAIL_CLIENT_ID=your_google_client_id.apps.googleusercontent.com</p>
              <p>GMAIL_CLIENT_SECRET=your_google_client_secret</p>
              <p># Microsoft 365 / Outlook Credentials</p>
              <p>MICROSOFT_CLIENT_ID=your_azure_client_id</p>
              <p>MICROSOFT_CLIENT_SECRET=your_azure_client_secret</p>
              <p># WhatsApp Business Platform Cloud API Credentials</p>
              <p>WHATSAPP_ACCESS_TOKEN=your_meta_access_token</p>
              <p>WHATSAPP_PHONE_NUMBER_ID=your_meta_phone_number_id</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
