import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { MessageSquare, ArrowRightLeft, Send, User, Clock, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CollaborationSection({ targetType, targetId, title = "Team Context & Activity" }) {
  const [comments, setComments] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Handoff modal
  const [members, setMembers] = useState([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);

  const loadCollabData = useCallback(async () => {
    if (!targetType || !targetId) return;
    setLoading(true);
    try {
      const [cRes, hRes, mRes] = await Promise.all([
        api.get("/collaboration/comments", { params: { target_type: targetType, target_id: targetId } }),
        api.get("/collaboration/handoffs", { params: { target_type: targetType, target_id: targetId } }),
        api.get("/team")
      ]);
      setComments(Array.isArray(cRes.data) ? cRes.data : []);
      setHandoffs(Array.isArray(hRes.data) ? hRes.data : []);
      setMembers(Array.isArray(mRes.data) ? mRes.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    loadCollabData();
  }, [loadCollabData]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/collaboration/comments", {
        target_type: targetType,
        target_id: targetId,
        content: newComment,
      });
      toast.success("Note added");
      setNewComment("");
      loadCollabData();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHandoff = async () => {
    if (!handoffTarget) {
      toast.error("Select a teammate to hand off to");
      return;
    }
    setHandoffBusy(true);
    try {
      await api.post("/collaboration/handoffs", {
        target_type: targetType,
        target_id: targetId,
        assignee_id: handoffTarget,
        note: handoffNote,
      });
      toast.success("Responsibility handed off successfully");
      setHandoffOpen(false);
      setHandoffNote("");
      setHandoffTarget("");
      loadCollabData();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setHandoffBusy(false);
    }
  };

  return (
    <Card className="border-border/70 bg-card/90 p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-base font-semibold">{title}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)} className="gap-1.5 text-xs">
          <ArrowRightLeft className="h-3.5 w-3.5" /> Hand Off Work
        </Button>
      </div>

      {/* Work Handoff Trail */}
      {handoffs.length > 0 && (
        <div className="my-4 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Handoff History</p>
          <div className="space-y-1.5">
            {handoffs.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{h.from_user_name}</span>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary" className="font-semibold text-primary">{h.to_user_name}</Badge>
                  {h.note && <span className="text-muted-foreground">({h.note})</span>}
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(h.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contextual Notes & Comments Feed */}
      <div className="mt-4 space-y-4">
        {loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading collaboration history...</p>
        ) : comments.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No notes or @mentions yet. Type below to add contextual team notes.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
                <div className="flex items-center justify-between font-medium">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground font-semibold">{c.author_name}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {formatDate(c.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 leading-relaxed text-foreground whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Comment Box */}
        <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add internal note or mention (@Name)..."
            className="text-xs"
          />
          <Button type="submit" size="sm" disabled={submitting || !newComment.trim()} className="gap-1">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Post
          </Button>
        </form>
      </div>

      {/* Handoff Responsibility Dialog */}
      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand Off Work Responsibility</DialogTitle>
            <DialogDescription>
              Assign the next action for this {targetType} to a teammate. They will be notified and responsible for the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="font-medium text-muted-foreground">Teammate Responsible</label>
              <Select value={handoffTarget} onValueChange={setHandoffTarget}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select teammate..." /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.role.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium text-muted-foreground">Handoff Instructions / Context</label>
              <Input
                value={handoffNote}
                onChange={(e) => setHandoffNote(e.target.value)}
                placeholder="e.g. Follow up on payment verification after client approval..."
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandoffOpen(false)}>Cancel</Button>
            <Button onClick={handleHandoff} disabled={handoffBusy}>
              {handoffBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Handoff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
