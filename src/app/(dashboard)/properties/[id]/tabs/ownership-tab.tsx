"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Crown, FileText, History, Plus, RotateCcw, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError, uploadFile } from "@/lib/api-client";
import type { OwnershipEventDto, OwnershipOverviewDto, PropertyOwnershipDto } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const poundsToCents = (value: string) => value ? Math.round(Number(value) * 100) : 0;
const money = (cents: number, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);

export function OwnershipTab({ propertyId, ownershipStatus }: { propertyId: string; ownershipStatus: "verified" | "inferred" | "pending" }) {
  const queryClient = useQueryClient();
  const [asOf, setAsOf] = useState(today());
  const query = useQuery({
    queryKey: ["property-ownership", propertyId, asOf],
    queryFn: async () => (await api.get<OwnershipOverviewDto>(`/api/v1/properties/${propertyId}/owners?asOf=${asOf}`)).data,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["property-ownership", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  if (query.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading ownership ledger…</CardContent></Card>;
  if (!query.data) return <Card><CardContent className="p-6 text-sm text-destructive">Ownership history could not be loaded.</CardContent></Card>;
  const data = query.data;
  const currentDate = asOf === today();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Current ownership</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Effective position on {asOf}. This ledger is the ownership source of truth.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TransferDialog propertyId={propertyId} data={data} onSaved={refresh} />
            <PaymentDialog propertyId={propertyId} data={data} onSaved={refresh} />
            <InstalmentDialog propertyId={propertyId} data={data} onSaved={refresh} />
            <NoteDialog propertyId={propertyId} data={data} onSaved={refresh} />
            <DocumentDialog propertyId={propertyId} onSaved={refresh} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ownershipStatus !== "verified" ? (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                {ownershipStatus === "pending"
                  ? "Share percentages are pending confirmation. Any 100% technical allocation shown here exists only to keep the ledger valid and must not be treated as legal ownership."
                  : "This split was inferred from formulas in the source workbook. Confirm it against title or partnership records before treating it as verified legal ownership."}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/50 p-3">
            <div><Label htmlFor="ownership-as-of">View ownership on date</Label><Input id="ownership-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></div>
            {!currentDate ? <Button variant="outline" onClick={() => setAsOf(today())}>Return to today</Button> : null}
          </div>
          {Math.round(data.ownershipTotal * 100) !== 10_000 ? (
            <div className="flex gap-2 rounded-md border border-destructive p-3 text-sm text-destructive"><AlertTriangle className="size-4" /> Ownership totals {data.ownershipTotal.toFixed(2)}%, not 100%.</div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {data.ownerships.map((owner) => (
              <OwnerCard key={owner.ownerId} owner={owner} data={data} propertyId={propertyId} onSaved={refresh} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5" /> Ownership payments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.payments.length === 0 ? <p className="text-sm text-muted-foreground">No ownership-related payments recorded.</p> : data.payments.map((payment) => (
            <div key={payment.id} className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-5">
              <div><p className="font-medium capitalize">{payment.kind.replaceAll("_", " ")}</p><p className="text-muted-foreground">{payment.payerName ?? "Property"} → {payment.recipientName ?? "Property"}</p></div>
              <div><p className="font-medium">{money(payment.amountDueCents, payment.currency)}</p><p className="text-muted-foreground">Agreed/due</p></div>
              <div><p className="font-medium">{money(payment.amountPaidCents, payment.currency)}</p><p className="text-muted-foreground">Paid</p></div>
              <div><p className="font-medium">{money(payment.outstandingCents, payment.currency)}</p><p className="text-muted-foreground">Outstanding</p></div>
              <div><Badge variant="outline" className="capitalize">{payment.status.replaceAll("_", " ")}</Badge><p className="mt-1 text-muted-foreground">{payment.throughPropertyFunds ? "Property cash flow" : "Private—excluded from property cash flow"}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5" /> Ownership timeline</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data.events.map((event, index) => (
            <TimelineEvent key={event.id} event={event} isLatest={index === 0} propertyId={propertyId} onSaved={refresh} />
          ))}
          {data.notes.map((note) => (
            <div key={note.id} className="border-l-2 pl-4 text-sm"><p className="font-medium">Note · {note.title}</p><p className="text-muted-foreground">{note.noteDate} · {note.authorName}{note.ownerName ? ` · ${note.ownerName}` : ""}</p><p className="mt-1 whitespace-pre-wrap">{note.noteText}</p>{note.documentFileId ? <a className="mt-1 inline-block underline" href={`/api/v1/files/${note.documentFileId}/download`}>Open supporting document</a> : null}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OwnerCard({ owner, data, propertyId, onSaved }: { owner: PropertyOwnershipDto; data: OwnershipOverviewDto; propertyId: string; onSaved: () => void }) {
  const related = data.payments.filter((payment) => payment.payerOwnerId === owner.ownerId || payment.recipientOwnerId === owner.ownerId);
  const capital = related.filter((payment) => payment.kind === "capital_contribution" && payment.payerOwnerId === owner.ownerId).reduce((sum, payment) => sum + payment.amountPaidCents, 0);
  const acquisition = related.filter((payment) => ["private_transfer", "property_funded_purchase"].includes(payment.kind) && payment.payerOwnerId === owner.ownerId).reduce((sum, payment) => sum + payment.amountPaidCents, 0);
  const outstanding = related.filter((payment) => payment.payerOwnerId === owner.ownerId).reduce((sum, payment) => sum + Math.max(0, payment.outstandingCents), 0);
  const makeMain = useMutation({
    mutationFn: () => api.put(`/api/v1/properties/${propertyId}/owners`, {
      mode: data.ownerships.length === 1 ? "sole" : "shared", effectiveFrom: today(),
      expectedCurrentEventId: data.currentEventId, reason: `Main landlord changed to ${owner.fullName}`,
      owners: data.ownerships.map((item) => ({ ownerId: item.ownerId, fullName: item.fullName, address: item.address, phone: item.phone, email: item.email, ownershipPercentage: item.ownershipPercentage, isMainLandlord: item.ownerId === owner.ownerId })),
    }),
    onSuccess: () => { toast.success("Main landlord changed"); onSaved(); },
    onError: showError,
  });
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{owner.fullName}</p>{owner.isMainLandlord ? <Badge><Crown className="size-3" /> Main landlord</Badge> : null}</div><p className="text-sm text-muted-foreground">Effective from {owner.effectiveFrom}</p></div><p className="text-xl font-semibold">{owner.ownershipPercentage.toFixed(2)}%</p></div>
      <p className="mt-2 text-sm text-muted-foreground">{owner.address}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Metric label="Capital" value={money(capital)} /><Metric label="Acquisition paid" value={money(acquisition)} /><Metric label="Outstanding" value={money(outstanding)} /></div>
      {!owner.isMainLandlord ? <Button className="mt-3" size="sm" variant="outline" disabled={makeMain.isPending} onClick={() => makeMain.mutate()}><Crown className="size-4" /> Make main landlord</Button> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }

function TimelineEvent({ event, isLatest, propertyId, onSaved }: { event: OwnershipEventDto; isLatest: boolean; propertyId: string; onSaved: () => void }) {
  const reverse = useMutation({ mutationFn: () => api.post(`/api/v1/properties/${propertyId}/ownership-events/${event.id}/reverse`, { effectiveDate: today(), reason: `Reversal of ${event.eventType} event`, notes: "Recorded as a corrective reversal; the original event remains visible." }), onSuccess: () => { toast.success("Reversal recorded"); onSaved(); }, onError: showError });
  return <div className="border-l-2 pl-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium capitalize">{event.eventType.replaceAll("_", " ")}{event.transferType ? ` · ${event.transferType}` : ""}</p><p className="text-muted-foreground">Effective {event.effectiveDate} · recorded {new Date(event.recordedAt).toLocaleString("en-GB")} by {event.recordedByName}</p></div>{isLatest && event.eventType !== "initial" ? <Button size="sm" variant="ghost" disabled={reverse.isPending} onClick={() => reverse.mutate()}><RotateCcw className="size-4" /> Reverse</Button> : null}</div>{event.sellerName ? <p className="mt-1">{event.sellerName} <ArrowRight className="inline size-3" /> {event.buyerName} · {event.percentageTransferred}% · {event.agreedValueCents != null ? money(event.agreedValueCents, event.currency) : "No consideration"}</p> : null}<p className="mt-1">{event.reason}</p>{event.notes ? <p className="text-muted-foreground">{event.notes}</p> : null}<div className="mt-2 flex flex-wrap gap-2">{event.allocations.map((owner) => <Badge key={owner.ownerId} variant="outline">{owner.fullName} {owner.ownershipPercentage}%{owner.isMainLandlord ? " · main" : ""}</Badge>)}</div></div>;
}

function TransferDialog({ propertyId, data, onSaved }: { propertyId: string; data: OwnershipOverviewDto; onSaved: () => void }) {
  const [open, setOpen] = useState(false); const [sellerId, setSellerId] = useState(data.ownerships[0]?.ownerId ?? ""); const [buyerMode, setBuyerMode] = useState("new"); const [buyerId, setBuyerId] = useState(""); const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [percentage, setPercentage] = useState(""); const [effectiveDate, setEffectiveDate] = useState(today()); const [completionDate, setCompletionDate] = useState(today()); const [transferType, setTransferType] = useState("sale"); const [price, setPrice] = useState(""); const [paid, setPaid] = useState(""); const [treatment, setTreatment] = useState("private"); const [fundDirection, setFundDirection] = useState("into_property"); const [mainId, setMainId] = useState(data.mainLandlord?.ownerId ?? ""); const [notes, setNotes] = useState("");
  const seller = data.ownerships.find((owner) => owner.ownerId === sellerId); const buyer = data.ownerships.find((owner) => owner.ownerId === buyerId);
  const after = useMemo(() => { if (!seller || !percentage) return []; const amount = Number(percentage); const rows = data.ownerships.map((owner) => ({ ...owner })); const sellerRow = rows.find((owner) => owner.ownerId === sellerId)!; sellerRow.ownershipPercentage -= amount; const buyerRow = rows.find((owner) => owner.ownerId === buyerId); if (buyerRow) buyerRow.ownershipPercentage += amount; else rows.push({ ...sellerRow, ownerId: "new", fullName: name || "New owner", ownershipPercentage: amount, isMainLandlord: false }); return rows.filter((owner) => owner.ownershipPercentage > 0); }, [buyerId, data.ownerships, name, percentage, seller, sellerId]);
  const mutation = useMutation({
    mutationFn: () => api.post(`/api/v1/properties/${propertyId}/ownership-transfers`, {
      sellerOwnerId: sellerId,
      buyer: buyerMode === "existing" && buyer
        ? { ownerId: buyer.ownerId, fullName: buyer.fullName, address: buyer.address, phone: buyer.phone, email: buyer.email }
        : { fullName: name, address },
      percentageTransferred: Number(percentage), effectiveDate,
      legalCompletionDate: completionDate || null, transferType,
      agreedValueCents: price ? poundsToCents(price) : null,
      currency: "GBP", paymentTreatment: treatment,
      effectiveAfterFullPayment: false,
      mainLandlordOwnerId: mainId === "new" ? null : mainId,
      makeBuyerMainLandlord: mainId === "new",
      expectedCurrentEventId: data.currentEventId,
      reason: `${transferType} transfer from ${seller?.fullName ?? "seller"}`,
      notes: notes || null,
      payments: paid ? [{
        amountDueCents: poundsToCents(paid),
        amountPaidCents: poundsToCents(paid),
        paidOn: effectiveDate,
        throughPropertyFunds: treatment === "property_funds",
        propertyFundDirection: treatment === "property_funds" ? fundDirection : null,
      }] : [],
    }),
    onSuccess: () => { toast.success("Ownership transfer recorded"); setOpen(false); onSaved(); },
    onError: showError,
  });
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><ArrowRight className="size-4" /> Transfer/change shares</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Ownership transfer</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Seller"><Select value={sellerId} onValueChange={setSellerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.ownerships.map((owner) => <SelectItem key={owner.ownerId} value={owner.ownerId}>{owner.fullName} ({owner.ownershipPercentage}%)</SelectItem>)}</SelectContent></Select></Field><Field label="Buyer type"><Select value={buyerMode} onValueChange={setBuyerMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New owner</SelectItem><SelectItem value="existing">Existing owner</SelectItem></SelectContent></Select></Field>{buyerMode === "existing" ? <Field label="Buyer"><Select value={buyerId} onValueChange={setBuyerId}><SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger><SelectContent>{data.ownerships.filter((owner) => owner.ownerId !== sellerId).map((owner) => <SelectItem key={owner.ownerId} value={owner.ownerId}>{owner.fullName}</SelectItem>)}</SelectContent></Select></Field> : <><Field label="Buyer legal name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Buyer address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field></>}<Field label="Percentage transferred"><Input inputMode="decimal" value={percentage} onChange={(e) => setPercentage(e.target.value)} /></Field><Field label="Transfer type"><Select value={transferType} onValueChange={setTransferType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["sale","gift","inheritance","correction","other"].map((type) => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent></Select></Field><Field label="Ownership effective date"><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field><Field label="Legal completion date"><Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} /></Field><Field label="Agreed price £"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field><Field label="Paid now £"><Input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field><Field label="Payment treatment"><Select value={treatment} onValueChange={setTreatment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private buyer → seller</SelectItem><SelectItem value="property_funds">Through property funds</SelectItem></SelectContent></Select></Field>{treatment === "property_funds" ? <Field label="Property cash direction"><Select value={fundDirection} onValueChange={setFundDirection}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="into_property">Into property</SelectItem><SelectItem value="out_of_property">Out of property</SelectItem></SelectContent></Select></Field> : null}<Field label="Main landlord after"><Select value={mainId} onValueChange={setMainId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{after.map((owner) => <SelectItem key={owner.ownerId} value={owner.ownerId}>{owner.fullName}</SelectItem>)}</SelectContent></Select></Field></div><Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field><div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">Preview after transfer</p><div className="mt-2 flex flex-wrap gap-2">{after.map((owner) => <Badge key={owner.ownerId} variant="outline">{owner.fullName}: {owner.ownershipPercentage.toFixed(2)}%</Badge>)}</div><p className="mt-2">Due: {money(poundsToCents(price))} · paid: {money(poundsToCents(paid))} · outstanding: {money(Math.max(0, poundsToCents(price) - poundsToCents(paid)))}</p><p className="text-muted-foreground">{treatment === "private" ? "Excluded from property income, expenses and ROI." : "Creates a separate property cash-flow transaction."}</p></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={mutation.isPending || !sellerId || !percentage || (buyerMode === "new" ? !name || !address : !buyerId)} onClick={() => mutation.mutate()}>Confirm transfer atomically</Button></DialogFooter></DialogContent></Dialog>;
}

function PaymentDialog({ propertyId, data, onSaved }: { propertyId: string; data: OwnershipOverviewDto; onSaved: () => void }) { const [open,setOpen]=useState(false); const [kind,setKind]=useState("capital_contribution"); const [ownerId,setOwnerId]=useState(data.ownerships[0]?.ownerId ?? ""); const [amount,setAmount]=useState(""); const [paid,setPaid]=useState(""); const [dueOn,setDueOn]=useState(today()); const [through,setThrough]=useState(true); const mutation=useMutation({mutationFn:()=>api.post(`/api/v1/properties/${propertyId}/ownership-payments`,{kind,payerOwnerId:["capital_contribution","private_transfer"].includes(kind)?ownerId:null,recipientOwnerId:["capital_withdrawal","distribution","property_funded_purchase"].includes(kind)?ownerId:null,amountDueCents:poundsToCents(amount),amountPaidCents:poundsToCents(paid),currency:"GBP",dueOn,paidOn:paid?today():null,throughPropertyFunds:kind==="private_transfer"?false:through,propertyFundDirection:kind==="private_transfer"?null:(["capital_contribution"].includes(kind)?"into_property":"out_of_property")}),onSuccess:()=>{toast.success("Payment recorded");setOpen(false);onSaved();},onError:showError}); return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><WalletCards className="size-4" /> Record payment</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Ownership-related payment</DialogTitle></DialogHeader><Field label="Type"><Select value={kind} onValueChange={(v)=>{setKind(v);setThrough(v!=="private_transfer");}}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["capital_contribution","capital_withdrawal","distribution","property_funded_purchase","private_transfer"].map((v)=><SelectItem key={v} value={v}>{v.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></Field><Field label="Owner"><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.ownerships.map((o)=><SelectItem key={o.ownerId} value={o.ownerId}>{o.fullName}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Amount due £"><Input value={amount} onChange={(e)=>setAmount(e.target.value)} /></Field><Field label="Amount paid £"><Input value={paid} onChange={(e)=>setPaid(e.target.value)} /></Field></div><Field label="Due date"><Input type="date" value={dueOn} onChange={(e)=>setDueOn(e.target.value)} /></Field><p className="text-sm text-muted-foreground">{through ? "This records a separate property cash-flow transaction." : "This remains private and is excluded from property cash flow."}</p><DialogFooter><Button disabled={mutation.isPending||!amount} onClick={()=>mutation.mutate()}>Record payment</Button></DialogFooter></DialogContent></Dialog>; }

function NoteDialog({ propertyId, data, onSaved }: { propertyId: string; data: OwnershipOverviewDto; onSaved: () => void }) { const [open,setOpen]=useState(false); const [title,setTitle]=useState(""); const [text,setText]=useState(""); const [ownerId,setOwnerId]=useState("property"); const mutation=useMutation({mutationFn:()=>api.post(`/api/v1/properties/${propertyId}/ownership-notes`,{ownerId:ownerId==="property"?null:ownerId,title,noteText:text,noteDate:today(),sensitivity:"workspace"}),onSuccess:()=>{toast.success("Ownership note added");setOpen(false);setTitle("");setText("");onSaved();},onError:showError}); return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><FileText className="size-4" /> Add note</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Ownership note</DialogTitle></DialogHeader><Field label="Related to"><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="property">Property ownership generally</SelectItem>{data.ownerships.map((o)=><SelectItem key={o.ownerId} value={o.ownerId}>{o.fullName}</SelectItem>)}</SelectContent></Select></Field><Field label="Title"><Input value={title} onChange={(e)=>setTitle(e.target.value)} /></Field><Field label="Note"><Textarea value={text} onChange={(e)=>setText(e.target.value)} /></Field><DialogFooter><Button disabled={mutation.isPending||!title||!text} onClick={()=>mutation.mutate()}><Plus className="size-4" /> Add immutable note</Button></DialogFooter></DialogContent></Dialog>; }

function InstalmentDialog({ propertyId, data, onSaved }: { propertyId: string; data: OwnershipOverviewDto; onSaved: () => void }) {
  const transfers = data.events.filter((event) => event.eventType === "transfer" && event.outstandingCents > 0);
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState(transfers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const selected = transfers.find((event) => event.id === eventId);
  const mutation = useMutation({
    mutationFn: () => api.post(`/api/v1/properties/${propertyId}/ownership-payments`, {
      eventId,
      kind: selected?.paymentTreatment === "private" ? "private_transfer" : "property_funded_purchase",
      payerOwnerId: selected?.buyerOwnerId,
      recipientOwnerId: selected?.sellerOwnerId,
      amountDueCents: poundsToCents(amount),
      amountPaidCents: poundsToCents(amount),
      paidOn,
      currency: selected?.currency ?? "GBP",
      throughPropertyFunds: selected?.paymentTreatment === "property_funds",
      propertyFundDirection: selected?.paymentTreatment === "property_funds" ? "out_of_property" : null,
    }),
    onSuccess: () => { toast.success("Transfer instalment recorded"); setOpen(false); onSaved(); },
    onError: showError,
  });
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" disabled={transfers.length === 0}>Add instalment</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record transfer instalment</DialogTitle></DialogHeader><Field label="Transfer"><Select value={eventId} onValueChange={setEventId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{transfers.map((event) => <SelectItem key={event.id} value={event.id}>{event.sellerName} → {event.buyerName} · {money(event.outstandingCents, event.currency)} outstanding</SelectItem>)}</SelectContent></Select></Field><Field label="Amount paid £"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Payment date"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field><p className="text-sm text-muted-foreground">{selected?.paymentTreatment === "private" ? "Private payment—excluded from property cash flow." : "Property-funded payment—creates a linked property cash-flow transaction."}</p><DialogFooter><Button disabled={mutation.isPending || !eventId || !amount} onClick={() => mutation.mutate()}>Record instalment</Button></DialogFooter></DialogContent></Dialog>;
}

function DocumentDialog({ propertyId, onSaved }: { propertyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<globalThis.File | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a document");
      const uploaded = await uploadFile("ownership-doc", file);
      return api.post(`/api/v1/properties/${propertyId}/ownership-notes`, {
        title,
        noteText: `Supporting ownership document: ${file.name}`,
        noteDate: today(),
        sensitivity: "workspace",
        documentFileId: uploaded.data.id,
      });
    },
    onSuccess: () => { toast.success("Ownership document added"); setOpen(false); setTitle(""); setFile(null); onSaved(); },
    onError: showError,
  });
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><FileText className="size-4" /> Add document</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Supporting ownership document</DialogTitle></DialogHeader><Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="PDF or image"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field><DialogFooter><Button disabled={mutation.isPending || !title || !file} onClick={() => mutation.mutate()}>Upload and link</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function showError(error: unknown) { toast.error(error instanceof ApiClientError ? error.message : "Ownership action failed"); }
