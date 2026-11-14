/**
 * লাইভ সাপোর্টের রিয়েল-টাইম হাব — একটাই Durable Object ("hub")।
 * টিম (agent) আর দোকানদারদের (shop:<id>) WebSocket ধরে রাখে, নতুন মেসেজ/টাইপিং সাথে সাথে পাঠায়।
 * Hibernation API: কেউ কথা না বললে ঘুমিয়ে থাকে, খরচ প্রায় শূন্য।
 * মেসেজ নিজে D1-এ সেভ হয় (HTTP দিয়ে) — হাব শুধু খবর পৌঁছায়।
 */
import { DurableObject } from "cloudflare:workers";

type Attach = { role: "agent" | "shop"; shopId?: string; name: string };
export type HubEvent = { type: string; ticketId?: number; shopId?: string; [k: string]: unknown };

export class SupportHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // ping-এর উত্তর হাবকে না জাগিয়েই (খরচ বাঁচে)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const role = request.headers.get("x-sh-role");
    const shopId = request.headers.get("x-sh-shop") || undefined;
    const name = (request.headers.get("x-sh-name") || "").slice(0, 80);
    if (role !== "agent" && !(role === "shop" && shopId)) return new Response("forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const tags = role === "agent" ? ["agent"] : [`shop:${shopId}`];
    this.ctx.acceptWebSocket(server, tags);
    server.serializeAttachment({ role, shopId, name } satisfies Attach);
    // টিমের উপস্থিতি বদলালে দোকানদারদের জানানো
    if (role === "agent") this.presence();
    server.send(JSON.stringify({ type: "hello", agentsOnline: this.ctx.getWebSockets("agent").length }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let msg: HubEvent;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment() as Attach;
    if (msg.type === "ping") return ws.send('{"type":"pong"}');
    if (msg.type === "typing" && typeof msg.ticketId === "number") {
      const evt = JSON.stringify({ type: "typing", ticketId: msg.ticketId, from: me.role, name: me.name, shopId: me.shopId });
      if (me.role === "shop") this.sendTo("agent", evt);
      else if (typeof msg.shopId === "string") this.sendTo(`shop:${msg.shopId}`, evt);
    }
  }

  async webSocketClose(ws: WebSocket) {
    const me = ws.deserializeAttachment() as Attach | null;
    try { ws.close(); } catch {}
    if (me?.role === "agent") this.presence(ws);
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }

  /** নতুন মেসেজ/অবস্থা বদল — টিমের সবাই আর সংশ্লিষ্ট দোকান পায় */
  async broadcast(evt: HubEvent): Promise<void> {
    const data = JSON.stringify(evt);
    this.sendTo("agent", data);
    if (evt.shopId) this.sendTo(`shop:${evt.shopId}`, data);
  }

  async agentsOnline(): Promise<number> {
    return this.ctx.getWebSockets("agent").length;
  }

  private presence(closing?: WebSocket) {
    const n = this.ctx.getWebSockets("agent").filter((w) => w !== closing).length;
    const data = JSON.stringify({ type: "presence", agentsOnline: n });
    for (const w of this.ctx.getWebSockets()) {
      const a = w.deserializeAttachment() as Attach | null;
      if (a?.role === "shop") { try { w.send(data); } catch {} }
    }
  }

  private sendTo(tag: string, data: string) {
    for (const w of this.ctx.getWebSockets(tag)) { try { w.send(data); } catch {} }
  }
}
